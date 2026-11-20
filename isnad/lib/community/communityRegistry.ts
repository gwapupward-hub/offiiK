import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { recordAuditEvent, type Queryable } from "@/lib/community/communityAudit";
import { DELEGABLE_ROLES } from "@/lib/community/communityAuth";
import {
  defaultSettings,
  normalizeStoredSettings,
  type CommunitySettings,
  type VersionedCommunitySettings,
} from "@/lib/community/settingsSchema";
import {
  COMMUNITY_ROLES,
  type BotPermissionSnapshot,
  type ChatMemberStatus,
  type CommunityChatType,
  type CommunityRecord,
  type CommunityRole,
  type CommunityStatus,
  type ModuleKey,
  type TelegramChatRef,
} from "@/lib/community/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SETUP_NONCE_PREFIX = "cm_";
const SETUP_NONCE_TTL_SECONDS = 15 * 60;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type Actor = { userId: string | null; telegramUserId: number };

/** Looks up an existing Isnad account without creating one. */
export async function findUserIdByTelegramId(telegramUserId: number): Promise<string | null> {
  const sql = getDatabase();
  const [row] = await sql`
    SELECT user_id::text AS user_id FROM telegram_identities WHERE telegram_user_id = ${telegramUserId}
  `;
  return (row?.user_id as string | undefined) ?? null;
}

function iso(value: unknown): string | null {
  return value ? new Date(value as string | Date).toISOString() : null;
}

function mapCommunity(row: Record<string, unknown>): CommunityRecord {
  return {
    id: row.id as string,
    telegramChatId: Number(row.telegram_chat_id),
    chatType: row.chat_type as CommunityChatType,
    title: row.title as string,
    isForum: Boolean(row.is_forum),
    status: row.status as CommunityStatus,
    timezone: row.timezone as string,
    installedByTelegramUserId:
      row.installed_by_telegram_user_id === null || row.installed_by_telegram_user_id === undefined
        ? null
        : Number(row.installed_by_telegram_user_id),
    botStatus: row.bot_status as string,
    botPermissions: (row.bot_permissions ?? {}) as Partial<BotPermissionSnapshot>,
    botPermissionsCheckedAt: iso(row.bot_permissions_checked_at),
    activatedAt: iso(row.activated_at),
    pausedAt: iso(row.paused_at),
    pauseReason: (row.pause_reason as string | null) ?? null,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
  };
}

const COMMUNITY_COLUMNS = [
  "telegram_chat_id", "chat_type", "title", "is_forum", "status", "timezone",
  "installed_by_telegram_user_id", "bot_status", "bot_permissions", "bot_permissions_checked_at",
  "activated_at", "pause_reason", "paused_at", "created_at", "updated_at",
];

function communityFields(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return [`${prefix}id::text AS id`, ...COMMUNITY_COLUMNS.map((column) => `${prefix}${column}`)].join(", ");
}

const COMMUNITY_FIELDS = communityFields();

export function communityChatType(chat: Pick<TelegramChatRef, "type">): CommunityChatType | null {
  return chat.type === "group" || chat.type === "supergroup" || chat.type === "channel" ? chat.type : null;
}

export async function getCommunityById(id: string, db: Queryable = getDatabase()): Promise<CommunityRecord | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.unsafe(`SELECT ${COMMUNITY_FIELDS} FROM communities WHERE id = $1`, [id]);
  return row ? mapCommunity(row) : null;
}

export async function getCommunityByChatId(
  chatId: number,
  db: Queryable = getDatabase()
): Promise<CommunityRecord | null> {
  const [row] = await db.unsafe(`SELECT ${COMMUNITY_FIELDS} FROM communities WHERE telegram_chat_id = $1`, [chatId]);
  return row ? mapCommunity(row) : null;
}

async function lockCommunity(db: Queryable, id: string): Promise<CommunityRecord | null> {
  const [row] = await db.unsafe(`SELECT ${COMMUNITY_FIELDS} FROM communities WHERE id = $1 FOR UPDATE`, [id]);
  return row ? mapCommunity(row) : null;
}

/** Records (or refreshes) a community seen in an update. New rows start pending; nothing activates. */
export async function upsertCommunityFromChat(
  db: Queryable,
  chat: TelegramChatRef,
  options: { installedBy?: number | null } = {}
): Promise<{ community: CommunityRecord; created: boolean } | null> {
  const chatType = communityChatType(chat);
  if (!chatType) return null;
  const title = (chat.title ?? "").slice(0, 255);
  const [row] = await db.unsafe(
    `INSERT INTO communities (telegram_chat_id, chat_type, title, is_forum, installed_by_telegram_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_chat_id) DO UPDATE SET
       -- The bot demonstrably receives updates here, so a stale "removed" row reopens as pending.
       status = CASE WHEN communities.status = 'removed' THEN 'pending' ELSE communities.status END,
       activated_at = CASE WHEN communities.status = 'removed' THEN NULL ELSE communities.activated_at END,
       chat_type = EXCLUDED.chat_type,
       title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE communities.title END,
       is_forum = EXCLUDED.is_forum,
       updated_at = now()
     RETURNING ${COMMUNITY_FIELDS}, (xmax = 0) AS created`,
    [chat.id, chatType, title, Boolean(chat.is_forum), options.installedBy ?? null]
  );
  return { community: mapCommunity(row), created: Boolean(row.created) };
}

const PRESENT_STATUSES = new Set<ChatMemberStatus>(["creator", "administrator", "member", "restricted"]);

export type BotMembershipTransition = "added" | "readded" | "removed" | "permissions_changed" | "ignored";

/**
 * Applies a my_chat_member change for the bot. Being added creates or reopens
 * a *pending* installation only; activation always needs a verified admin.
 */
export async function recordBotMembershipChange(input: {
  chat: TelegramChatRef;
  newStatus: ChatMemberStatus;
  isMember?: boolean;
  snapshot: BotPermissionSnapshot;
  fromTelegramUserId: number | null;
  correlationId?: string;
  /** Called inside the transaction to decide whether an active community lost required permissions. */
  hasBlockedModules: (community: CommunityRecord, settings: CommunitySettings) => boolean;
}): Promise<{ community: CommunityRecord | null; transition: BotMembershipTransition }> {
  const chatType = communityChatType(input.chat);
  if (!chatType) return { community: null, transition: "ignored" };
  const present =
    PRESENT_STATUSES.has(input.newStatus) && !(input.newStatus === "restricted" && input.isMember === false);
  const sql = getDatabase();

  return sql.begin(async (tx) => {
    let community = await getCommunityByChatId(input.chat.id, tx);
    if (community) community = await lockCommunity(tx, community.id);

    if (!present) {
      if (!community) return { community: null, transition: "ignored" as const };
      const [row] = await tx.unsafe(
        `UPDATE communities SET status = 'removed', bot_status = $2, bot_permissions = $3::jsonb,
           bot_permissions_checked_at = now(), updated_at = now()
         WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
        [community.id, input.newStatus, JSON.stringify(input.snapshot)]
      );
      await recordAuditEvent(tx, {
        communityId: community.id,
        actorTelegramUserId: input.fromTelegramUserId,
        action: "bot.removed",
        entityType: "community",
        entityId: community.id,
        before: { status: community.status },
        after: { status: "removed", botStatus: input.newStatus },
        correlationId: input.correlationId,
      });
      return { community: mapCommunity(row), transition: "removed" as const };
    }

    if (!community || community.status === "removed") {
      const readded = Boolean(community);
      const upserted = await upsertCommunityFromChat(tx, input.chat, { installedBy: input.fromTelegramUserId });
      if (!upserted) return { community: null, transition: "ignored" as const };
      const communityId = upserted.community.id;
      const [row] = await tx.unsafe(
        `UPDATE communities SET status = 'pending', installed_by_telegram_user_id = $2,
           bot_status = $3, bot_permissions = $4::jsonb, bot_permissions_checked_at = now(),
           activated_at = NULL, activated_by = NULL, paused_at = NULL, paused_by = NULL,
           pause_reason = NULL, updated_at = now()
         WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
        [communityId, input.fromTelegramUserId, input.newStatus, JSON.stringify(input.snapshot)]
      );
      await recordAuditEvent(tx, {
        communityId,
        actorTelegramUserId: input.fromTelegramUserId,
        action: readded ? "bot.readded" : "bot.added",
        entityType: "community",
        entityId: communityId,
        before: community ? { status: community.status } : null,
        after: { status: "pending", chatType, botStatus: input.newStatus },
        correlationId: input.correlationId,
      });
      return { community: mapCommunity(row), transition: readded ? ("readded" as const) : ("added" as const) };
    }

    let nextStatus: CommunityStatus = community.status;
    if (community.status === "active") {
      const settings = await getCommunitySettings(community, tx);
      if (input.hasBlockedModules({ ...community, botPermissions: input.snapshot }, settings)) {
        nextStatus = "permission_lost";
      }
    }
    const [row] = await tx.unsafe(
      `UPDATE communities SET status = $2, bot_status = $3, bot_permissions = $4::jsonb,
         bot_permissions_checked_at = now(),
         title = CASE WHEN $5 <> '' THEN $5 ELSE title END, updated_at = now()
       WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
      [community.id, nextStatus, input.newStatus, JSON.stringify(input.snapshot), (input.chat.title ?? "").slice(0, 255)]
    );
    await recordAuditEvent(tx, {
      communityId: community.id,
      actorTelegramUserId: input.fromTelegramUserId,
      action: "bot.permissions_changed",
      entityType: "community",
      entityId: community.id,
      before: { status: community.status, botStatus: community.botStatus },
      after: { status: nextStatus, botStatus: input.newStatus },
      correlationId: input.correlationId,
    });
    return { community: mapCommunity(row), transition: "permissions_changed" as const };
  });
}

/** Group → supergroup upgrades change the chat id; carry the community across. */
export async function migrateCommunityChat(oldChatId: number, newChatId: number, correlationId?: string): Promise<void> {
  const sql = getDatabase();
  await sql.begin(async (tx) => {
    const old = await getCommunityByChatId(oldChatId, tx);
    if (!old) return;
    const replacement = await getCommunityByChatId(newChatId, tx);
    if (replacement) {
      const [{ count }] = await tx`
        SELECT count(*)::int AS count FROM community_memberships
        WHERE community_id = ${replacement.id} AND status = 'active'
      `;
      if (Number(count) > 0) return; // Both configured: leave for manual review.
      await tx`DELETE FROM community_setup_nonces WHERE community_id = ${replacement.id}`;
      await tx`DELETE FROM community_settings WHERE community_id = ${replacement.id}`;
      await tx`DELETE FROM community_memberships WHERE community_id = ${replacement.id}`;
      await tx`UPDATE community_audit_events SET community_id = ${old.id} WHERE community_id = ${replacement.id}`;
      await tx`DELETE FROM communities WHERE id = ${replacement.id}`;
    }
    await tx`
      UPDATE communities SET telegram_chat_id = ${newChatId}, chat_type = 'supergroup', updated_at = now()
      WHERE id = ${old.id}
    `;
    await recordAuditEvent(tx, {
      communityId: old.id,
      action: "community.chat_migrated",
      entityType: "community",
      entityId: old.id,
      before: { chatType: old.chatType },
      after: { chatType: "supergroup" },
      correlationId,
    });
  });
}

// ---------------------------------------------------------------------------
// Setup nonces
// ---------------------------------------------------------------------------

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

/** Issues a short-lived setup nonce bound to one administrator. Returns the raw value once. */
export async function issueSetupNonce(communityId: string, telegramUserId: number): Promise<string> {
  const nonce = `${SETUP_NONCE_PREFIX}${randomBytes(24).toString("base64url")}`;
  const sql = getDatabase();
  await sql`
    INSERT INTO community_setup_nonces (nonce_hash, community_id, issued_to_telegram_user_id, expires_at)
    VALUES (${hashNonce(nonce)}, ${communityId}, ${telegramUserId},
            now() + make_interval(secs => ${SETUP_NONCE_TTL_SECONDS}))
  `;
  return nonce;
}

export type SetupNonceLookup = {
  communityId: string;
  issuedToTelegramUserId: number;
  usable: boolean;
};

export async function findSetupNonce(nonce: string): Promise<SetupNonceLookup | null> {
  if (!nonce.startsWith(SETUP_NONCE_PREFIX) || nonce.length > 64 || !/^[A-Za-z0-9_-]+$/.test(nonce)) return null;
  const sql = getDatabase();
  const [row] = await sql`
    SELECT community_id::text AS community_id, issued_to_telegram_user_id,
           (consumed_at IS NULL AND expires_at > now()) AS usable
    FROM community_setup_nonces WHERE nonce_hash = ${hashNonce(nonce)}
  `;
  if (!row) return null;
  return {
    communityId: row.community_id as string,
    issuedToTelegramUserId: Number(row.issued_to_telegram_user_id),
    usable: Boolean(row.usable),
  };
}

// ---------------------------------------------------------------------------
// Memberships and roles
// ---------------------------------------------------------------------------

export async function getActiveRoles(
  communityId: string,
  telegramUserId: number,
  db: Queryable = getDatabase()
): Promise<CommunityRole[]> {
  const rows = await db`
    SELECT role FROM community_memberships
    WHERE community_id = ${communityId} AND telegram_user_id = ${telegramUserId} AND status = 'active'
  `;
  return rows.map((row) => row.role as CommunityRole).filter((role) => COMMUNITY_ROLES.includes(role));
}

export async function hasActiveOwner(communityId: string, db: Queryable = getDatabase()): Promise<boolean> {
  const [row] = await db`
    SELECT 1 AS present FROM community_memberships
    WHERE community_id = ${communityId} AND role = 'owner' AND status = 'active'
  `;
  return Boolean(row);
}

export async function markMembershipVerified(
  communityId: string,
  telegramUserId: number,
  telegramStatus: string
): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE community_memberships
    SET last_verified_at = now(), last_verified_status = ${telegramStatus}
    WHERE community_id = ${communityId} AND telegram_user_id = ${telegramUserId} AND status = 'active'
  `;
}

export type RoleAssignment = {
  id: string;
  telegramUserId: number;
  displayName: string | null;
  username: string | null;
  role: CommunityRole;
  grantedAt: string;
  lastVerifiedAt: string | null;
  lastVerifiedStatus: string | null;
};

export async function listRoleAssignments(communityId: string): Promise<RoleAssignment[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT m.id::text AS id, m.telegram_user_id, m.role, m.granted_at, m.last_verified_at,
           m.last_verified_status, t.username, t.first_name, t.last_name
    FROM community_memberships m
    LEFT JOIN telegram_identities t ON t.telegram_user_id = m.telegram_user_id
    WHERE m.community_id = ${communityId} AND m.status = 'active'
    ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.granted_at
  `;
  return rows.map((row) => ({
    id: row.id as string,
    telegramUserId: Number(row.telegram_user_id),
    displayName: row.first_name ? [row.first_name, row.last_name].filter(Boolean).join(" ") : null,
    username: (row.username as string | null) ?? null,
    role: row.role as CommunityRole,
    grantedAt: iso(row.granted_at) as string,
    lastVerifiedAt: iso(row.last_verified_at),
    lastVerifiedStatus: (row.last_verified_status as string | null) ?? null,
  }));
}

export async function grantRole(input: {
  communityId: string;
  targetTelegramUserId: number;
  role: CommunityRole;
  actor: Actor;
  correlationId?: string;
}): Promise<{ ok: true; assignmentId: string } | { ok: false; reason: "role_not_delegable" }> {
  if (!DELEGABLE_ROLES.includes(input.role)) return { ok: false, reason: "role_not_delegable" };
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const [identity] = await tx`
      SELECT user_id::text AS user_id FROM telegram_identities WHERE telegram_user_id = ${input.targetTelegramUserId}
    `;
    const [row] = await tx`
      INSERT INTO community_memberships (community_id, telegram_user_id, user_id, role, granted_by)
      VALUES (${input.communityId}, ${input.targetTelegramUserId}, ${identity?.user_id ?? null},
              ${input.role}, ${input.actor.userId})
      ON CONFLICT (community_id, telegram_user_id, role) DO UPDATE SET
        status = 'active', granted_by = EXCLUDED.granted_by, granted_at = now(),
        revoked_at = NULL, revoked_by = NULL, last_verified_at = NULL, last_verified_status = NULL
      RETURNING id::text AS id
    `;
    await recordAuditEvent(tx, {
      communityId: input.communityId,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: "role.granted",
      entityType: "community_membership",
      entityId: row.id as string,
      after: { role: input.role, telegramUserId: input.targetTelegramUserId },
      correlationId: input.correlationId,
    });
    return { ok: true as const, assignmentId: row.id as string };
  });
}

export async function revokeRole(input: {
  communityId: string;
  assignmentId: string;
  actor: Actor;
  correlationId?: string;
}): Promise<"revoked" | "not_found" | "owner_protected"> {
  if (!isUuid(input.assignmentId)) return "not_found";
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const [existing] = await tx`
      SELECT role, telegram_user_id FROM community_memberships
      WHERE id = ${input.assignmentId} AND community_id = ${input.communityId} AND status = 'active'
      FOR UPDATE
    `;
    if (!existing) return "not_found" as const;
    if (existing.role === "owner") return "owner_protected" as const;
    await tx`
      UPDATE community_memberships
      SET status = 'revoked', revoked_at = now(), revoked_by = ${input.actor.userId}
      WHERE id = ${input.assignmentId}
    `;
    await recordAuditEvent(tx, {
      communityId: input.communityId,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: "role.revoked",
      entityType: "community_membership",
      entityId: input.assignmentId,
      before: { role: existing.role as string, telegramUserId: Number(existing.telegram_user_id) },
      correlationId: input.correlationId,
    });
    return "revoked" as const;
  });
}

/** chat_member updates: record that a role holder's Telegram rights changed. Live checks stay authoritative. */
export async function recordMemberRightsChange(input: {
  chatId: number;
  telegramUserId: number;
  oldStatus: ChatMemberStatus;
  newStatus: ChatMemberStatus;
  correlationId?: string;
}): Promise<boolean> {
  const sql = getDatabase();
  const community = await getCommunityByChatId(input.chatId);
  if (!community) return false;
  const updated = await sql`
    UPDATE community_memberships
    SET last_verified_status = ${input.newStatus}, last_verified_at = now()
    WHERE community_id = ${community.id} AND telegram_user_id = ${input.telegramUserId} AND status = 'active'
    RETURNING id
  `;
  if (updated.length === 0) return false;
  const wasAdmin = input.oldStatus === "administrator" || input.oldStatus === "creator";
  const isAdmin = input.newStatus === "administrator" || input.newStatus === "creator";
  if (wasAdmin !== isAdmin) {
    await recordAuditEvent(sql, {
      communityId: community.id,
      actorTelegramUserId: input.telegramUserId,
      action: isAdmin ? "membership.telegram_rights_gained" : "membership.telegram_rights_lost",
      entityType: "community_membership",
      entityId: String(input.telegramUserId),
      before: { telegramStatus: input.oldStatus },
      after: { telegramStatus: input.newStatus },
      correlationId: input.correlationId,
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type CommunityListEntry = CommunityRecord & {
  roles: CommunityRole[];
  claimable: boolean;
};

/**
 * Candidate communities for a Telegram user: those with an active role, plus
 * unowned pending installations the user added. Callers must still apply the
 * live Telegram check before showing any of them.
 */
export async function listCandidateCommunities(telegramUserId: number, limit = 25): Promise<CommunityListEntry[]> {
  const sql = getDatabase();
  const rows = await sql.unsafe(
    `SELECT ${communityFields("c")},
            COALESCE(array_agg(m.role) FILTER (WHERE m.role IS NOT NULL), '{}') AS roles,
            (c.status = 'pending' AND c.installed_by_telegram_user_id = $1 AND NOT EXISTS (
              SELECT 1 FROM community_memberships o
              WHERE o.community_id = c.id AND o.role = 'owner' AND o.status = 'active'
            )) AS claimable
     FROM communities c
     LEFT JOIN community_memberships m
       ON m.community_id = c.id AND m.telegram_user_id = $1 AND m.status = 'active'
     WHERE c.status <> 'removed'
       AND (m.id IS NOT NULL OR (c.status = 'pending' AND c.installed_by_telegram_user_id = $1))
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT $2`,
    [telegramUserId, limit]
  );
  return rows.map((row) => ({
    ...mapCommunity(row),
    roles: (row.roles as CommunityRole[]) ?? [],
    claimable: Boolean(row.claimable),
  }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getCommunitySettings(
  community: Pick<CommunityRecord, "id" | "chatType" | "timezone">,
  db: Queryable = getDatabase()
): Promise<VersionedCommunitySettings> {
  const [row] = await db`
    SELECT assistant_config, verification_config, publisher_config, learning_config, version
    FROM community_settings WHERE community_id = ${community.id}
  `;
  const settings = row
    ? normalizeStoredSettings(community.chatType, {
        assistant: row.assistant_config,
        verification: row.verification_config,
        publisher: row.publisher_config,
        learning: row.learning_config,
      })
    : defaultSettings(community.chatType);
  return { ...settings, version: row ? Number(row.version) : 0, timezone: community.timezone };
}

async function ensureSettingsRow(db: Queryable, communityId: string, chatType: CommunityChatType, actorUserId: string | null) {
  const defaults = defaultSettings(chatType);
  await db`
    INSERT INTO community_settings (
      community_id, assistant_config, verification_config, publisher_config, learning_config, updated_by
    ) VALUES (
      ${communityId}, ${db.json(defaults.assistant as never)}, ${db.json(defaults.verification as never)},
      ${db.json(defaults.publisher as never)}, ${db.json(defaults.learning as never)}, ${actorUserId}
    )
    ON CONFLICT (community_id) DO NOTHING
  `;
}

function enabledSummary(settings: CommunitySettings): Record<ModuleKey, boolean> {
  return {
    assistant: settings.assistant.enabled,
    verification: settings.verification.enabled,
    publisher: settings.publisher.enabled,
    learning: settings.learning.enabled,
  };
}

export async function updateCommunitySettings(input: {
  community: CommunityRecord;
  expectedVersion: number;
  settings: CommunitySettings;
  timezone?: string;
  changed: ModuleKey[];
  actor: Actor;
  correlationId?: string;
}): Promise<{ ok: true; settings: VersionedCommunitySettings } | { ok: false; currentVersion: number }> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const before = await getCommunitySettings(input.community, tx);
    const rows = await tx`
      UPDATE community_settings SET
        assistant_config = ${tx.json(input.settings.assistant as never)},
        verification_config = ${tx.json(input.settings.verification as never)},
        publisher_config = ${tx.json(input.settings.publisher as never)},
        learning_config = ${tx.json(input.settings.learning as never)},
        version = version + 1,
        updated_by = ${input.actor.userId},
        updated_at = now()
      WHERE community_id = ${input.community.id} AND version = ${input.expectedVersion}
      RETURNING version
    `;
    if (rows.length === 0) return { ok: false as const, currentVersion: before.version };

    let timezone = input.community.timezone;
    if (input.timezone && input.timezone !== timezone) {
      await tx`UPDATE communities SET timezone = ${input.timezone}, updated_at = now() WHERE id = ${input.community.id}`;
      timezone = input.timezone;
    }
    await recordAuditEvent(tx, {
      communityId: input.community.id,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: "settings.updated",
      entityType: "community_settings",
      entityId: input.community.id,
      before: { version: before.version, enabled: enabledSummary(before), timezone: input.community.timezone },
      after: {
        version: Number(rows[0].version),
        enabled: enabledSummary(input.settings),
        changedModules: input.changed,
        timezone,
      },
      correlationId: input.correlationId,
    });
    return {
      ok: true as const,
      settings: { ...input.settings, version: Number(rows[0].version), timezone },
    };
  });
}

// ---------------------------------------------------------------------------
// Lifecycle: claim, activate, pause, resume
// ---------------------------------------------------------------------------

export type ClaimOutcome =
  | { outcome: "claimed" | "already_owner" | "ownership_recovered"; community: CommunityRecord }
  | { outcome: "owned_by_other"; community: CommunityRecord }
  | { outcome: "removed" | "not_found" };

export async function claimCommunity(input: {
  communityId: string;
  actor: Actor;
  chat: TelegramChatRef;
  botSnapshot: BotPermissionSnapshot;
  nonce?: string;
  recoverOwnership?: boolean;
  correlationId?: string;
}): Promise<ClaimOutcome> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const community = await lockCommunity(tx, input.communityId);
    if (!community) return { outcome: "not_found" as const };
    if (community.status === "removed") return { outcome: "removed" as const };

    const [owner] = await tx`
      SELECT id::text AS id, telegram_user_id FROM community_memberships
      WHERE community_id = ${community.id} AND role = 'owner' AND status = 'active'
    `;
    const consumeNonce = async () => {
      if (input.nonce) {
        await tx`
          UPDATE community_setup_nonces SET consumed_at = now()
          WHERE nonce_hash = ${hashNonce(input.nonce)} AND consumed_at IS NULL
        `;
      }
    };

    if (owner && Number(owner.telegram_user_id) === input.actor.telegramUserId) {
      await consumeNonce();
      return { outcome: "already_owner" as const, community };
    }
    if (owner && !input.recoverOwnership) return { outcome: "owned_by_other" as const, community };
    if (owner) {
      await tx`
        UPDATE community_memberships SET status = 'revoked', revoked_at = now(), revoked_by = ${input.actor.userId}
        WHERE id = ${owner.id}
      `;
    }

    await tx`
      INSERT INTO community_memberships (
        community_id, telegram_user_id, user_id, role, granted_by, last_verified_at, last_verified_status
      ) VALUES (
        ${community.id}, ${input.actor.telegramUserId}, ${input.actor.userId}, 'owner',
        ${input.actor.userId}, now(), 'administrator'
      )
      ON CONFLICT (community_id, telegram_user_id, role) DO UPDATE SET
        status = 'active', revoked_at = NULL, revoked_by = NULL, granted_at = now(),
        granted_by = EXCLUDED.granted_by, last_verified_at = now(), last_verified_status = 'administrator'
    `;
    const chatType = communityChatType(input.chat) ?? community.chatType;
    await ensureSettingsRow(tx, community.id, chatType, input.actor.userId);
    const [row] = await tx.unsafe(
      `UPDATE communities SET chat_type = $2, title = CASE WHEN $3 <> '' THEN $3 ELSE title END,
         is_forum = $4, bot_status = $5, bot_permissions = $6::jsonb, bot_permissions_checked_at = now(),
         updated_at = now()
       WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
      [
        community.id,
        chatType,
        (input.chat.title ?? "").slice(0, 255),
        Boolean(input.chat.is_forum),
        input.botSnapshot.status,
        JSON.stringify(input.botSnapshot),
      ]
    );
    await consumeNonce();
    await recordAuditEvent(tx, {
      communityId: community.id,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: owner ? "community.ownership_recovered" : "community.claimed",
      entityType: "community",
      entityId: community.id,
      before: { status: community.status, previousOwnerTelegramUserId: owner ? Number(owner.telegram_user_id) : null },
      after: { status: community.status, ownerTelegramUserId: input.actor.telegramUserId, via: input.nonce ? "setup_link" : "mini_app" },
      correlationId: input.correlationId,
    });
    return { outcome: owner ? ("ownership_recovered" as const) : ("claimed" as const), community: mapCommunity(row) };
  });
}

export async function saveBotSnapshot(communityId: string, snapshot: BotPermissionSnapshot): Promise<void> {
  const sql = getDatabase();
  await sql`
    UPDATE communities SET bot_status = ${snapshot.status}, bot_permissions = ${sql.json(snapshot as never)},
      bot_permissions_checked_at = now(), updated_at = now()
    WHERE id = ${communityId}
  `;
}

export type LifecycleResult =
  | { ok: true; community: CommunityRecord; changed: boolean }
  | { ok: false; reason: "invalid_state" | "version_conflict" | "not_found"; currentVersion?: number; status?: CommunityStatus };

/** Step 6: atomically activates a pending community whose reviewed settings version is still current. */
export async function activateCommunity(input: {
  communityId: string;
  expectedVersion: number;
  snapshot: BotPermissionSnapshot;
  actor: Actor;
  correlationId?: string;
}): Promise<LifecycleResult> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const community = await lockCommunity(tx, input.communityId);
    if (!community) return { ok: false as const, reason: "not_found" as const };
    if (community.status === "active") return { ok: true as const, community, changed: false };
    if (community.status !== "pending") {
      return { ok: false as const, reason: "invalid_state" as const, status: community.status };
    }
    const settings = await getCommunitySettings(community, tx);
    if (settings.version !== input.expectedVersion) {
      return { ok: false as const, reason: "version_conflict" as const, currentVersion: settings.version };
    }
    const [row] = await tx.unsafe(
      `UPDATE communities SET status = 'active', activated_at = now(), activated_by = $2,
         bot_status = $3, bot_permissions = $4::jsonb, bot_permissions_checked_at = now(), updated_at = now()
       WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
      [community.id, input.actor.userId, input.snapshot.status, JSON.stringify(input.snapshot)]
    );
    await recordAuditEvent(tx, {
      communityId: community.id,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: "community.activated",
      entityType: "community",
      entityId: community.id,
      before: { status: community.status },
      after: { status: "active", settingsVersion: settings.version, enabled: enabledSummary(settings) },
      correlationId: input.correlationId,
    });
    return { ok: true as const, community: mapCommunity(row), changed: true };
  });
}

/** Emergency pause. Allowed from any non-removed state and idempotent. */
export async function pauseCommunity(input: {
  communityId: string;
  reason?: string;
  actor: Actor;
  source: "mini_app" | "group_command";
  correlationId?: string;
}): Promise<LifecycleResult> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const community = await lockCommunity(tx, input.communityId);
    if (!community) return { ok: false as const, reason: "not_found" as const };
    if (community.status === "paused") return { ok: true as const, community, changed: false };
    if (community.status === "removed") {
      return { ok: false as const, reason: "invalid_state" as const, status: community.status };
    }
    const [row] = await tx.unsafe(
      `UPDATE communities SET status = 'paused', paused_at = now(), paused_by = $2, pause_reason = $3, updated_at = now()
       WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
      [community.id, input.actor.userId, input.reason?.slice(0, 280) ?? null]
    );
    await recordAuditEvent(tx, {
      communityId: community.id,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: "community.paused",
      entityType: "community",
      entityId: community.id,
      before: { status: community.status },
      after: { status: "paused", source: input.source },
      correlationId: input.correlationId,
    });
    return { ok: true as const, community: mapCommunity(row), changed: true };
  });
}

/**
 * Resume after a pause or permission loss. The caller must pass a *fresh*
 * permission snapshot; if any enabled module is still blocked the community
 * moves to permission_lost instead of active.
 */
export async function resumeCommunity(input: {
  communityId: string;
  snapshot: BotPermissionSnapshot;
  blocked: boolean;
  actor: Actor;
  source: "mini_app" | "group_command";
  correlationId?: string;
}): Promise<LifecycleResult> {
  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const community = await lockCommunity(tx, input.communityId);
    if (!community) return { ok: false as const, reason: "not_found" as const };
    if (community.status !== "paused" && community.status !== "permission_lost") {
      return { ok: false as const, reason: "invalid_state" as const, status: community.status };
    }
    const target: CommunityStatus = input.blocked ? "permission_lost" : community.activatedAt ? "active" : "pending";
    const [row] = await tx.unsafe(
      `UPDATE communities SET status = $2, paused_at = NULL, paused_by = NULL, pause_reason = NULL,
         bot_status = $3, bot_permissions = $4::jsonb, bot_permissions_checked_at = now(), updated_at = now()
       WHERE id = $1 RETURNING ${COMMUNITY_FIELDS}`,
      [community.id, target, input.snapshot.status, JSON.stringify(input.snapshot)]
    );
    await recordAuditEvent(tx, {
      communityId: community.id,
      actorUserId: input.actor.userId,
      actorTelegramUserId: input.actor.telegramUserId,
      action: input.blocked ? "community.resume_blocked" : "community.resumed",
      entityType: "community",
      entityId: community.id,
      before: { status: community.status },
      after: { status: target, source: input.source },
      correlationId: input.correlationId,
    });
    return { ok: true as const, community: mapCommunity(row), changed: true };
  });
}
