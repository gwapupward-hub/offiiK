import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { databaseConfigured, getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { consumeRateLimit, rateLimitKey, upsertTelegramIdentity } from "@/lib/store";
import { validateTelegramInitData, type TelegramUser } from "@/lib/telegramAuth";
import { resolveCapabilities } from "@/lib/community/communityAuth";
import {
  getActiveRoles,
  getCommunityById,
  markMembershipVerified,
  type Actor,
} from "@/lib/community/communityRegistry";
import { adminAuthMaxAgeSeconds, communityFeaturesEnabled } from "@/lib/community/featureFlags";
import { getTelegramClient, TelegramApiError, type TelegramClient } from "@/lib/community/telegramApi";
import type {
  Capability,
  CommunityRecord,
  CommunityRole,
  TelegramChatMember,
} from "@/lib/community/types";

export type ApiErrorCode =
  | "unauthenticated"
  | "session_expired"
  | "forbidden"
  | "telegram_rights_required"
  | "not_found"
  | "conflict"
  | "version_conflict"
  | "invalid_state"
  | "owned_by_other"
  | "bot_not_in_chat"
  | "idempotency_key_required"
  | "idempotency_key_reused"
  | "request_in_progress"
  | "validation_failed"
  | "missing_permissions"
  | "rate_limited"
  | "feature_disabled"
  | "unavailable";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  correlationId: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...extra } },
    { status, headers: { "X-Request-Id": correlationId, "Cache-Control": "no-store", ...headers } }
  );
}

export function apiJson(data: unknown, correlationId: string, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "X-Request-Id": correlationId, "Cache-Control": "no-store", ...headers },
  });
}

export type AdminSession = {
  correlationId: string;
  telegramUser: TelegramUser;
  startParam?: string;
  actor: Actor;
};

type Failure = { ok: false; response: NextResponse };

const READ_LIMIT_PER_MINUTE = 120;
const WRITE_LIMIT_PER_MINUTE = 30;

/**
 * Authenticates a Community Manager request: feature flag, database, signed
 * Telegram initData (with a stricter maximum age than ordinary chat), and a
 * per-user rate limit. Community authority is checked separately and live.
 */
export async function requireAdminSession(
  request: Request,
  options: { mutation: boolean }
): Promise<{ ok: true; session: AdminSession } | Failure> {
  const correlationId = randomUUID();
  if (!communityFeaturesEnabled()) {
    return { ok: false, response: apiError(503, "feature_disabled", "Community management is not enabled.", correlationId) };
  }
  if (!databaseConfigured()) {
    return { ok: false, response: apiError(503, "unavailable", "Community management requires the database.", correlationId) };
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { ok: false, response: apiError(503, "unavailable", "Telegram is not configured.", correlationId) };
  }

  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    return { ok: false, response: apiError(401, "unauthenticated", "Open the Community Manager from Telegram.", correlationId) };
  }
  const validation = validateTelegramInitData(initData, botToken, adminAuthMaxAgeSeconds());
  if (!validation.valid || !validation.user) {
    const expired = validation.reason === "expired";
    return {
      ok: false,
      response: apiError(
        401,
        expired ? "session_expired" : "unauthenticated",
        expired ? "Your Telegram session expired. Close and reopen the Mini App." : "Telegram authentication failed.",
        correlationId
      ),
    };
  }

  const limit = await consumeRateLimit(
    rateLimitKey(`community-api:${options.mutation ? "write" : "read"}:${validation.user.id}`),
    options.mutation ? WRITE_LIMIT_PER_MINUTE : READ_LIMIT_PER_MINUTE,
    60
  );
  if (!limit.allowed) {
    return {
      ok: false,
      response: apiError(429, "rate_limited", "Too many requests. Try again in a minute.", correlationId, {}, { "Retry-After": "60" }),
    };
  }

  const user = validation.user;
  const userId = await upsertTelegramIdentity({
    id: user.id,
    first_name: user.first_name?.trim() || user.username?.trim() || "Telegram user",
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
  });

  return {
    ok: true,
    session: {
      correlationId,
      telegramUser: user,
      startParam: validation.startParam,
      actor: { userId, telegramUserId: user.id },
    },
  };
}

export function telegramClientOrFailure(correlationId: string): { ok: true; client: TelegramClient } | Failure {
  const client = getTelegramClient();
  if (!client) return { ok: false, response: apiError(503, "unavailable", "Telegram is not configured.", correlationId) };
  return { ok: true, client };
}

/** Live getChatMember. A 400/403 means "not a member"; anything else fails closed. */
export async function liveChatMember(
  client: TelegramClient,
  chatId: number,
  userId: number
): Promise<{ ok: true; member: TelegramChatMember | null } | { ok: false; error: TelegramApiError | Error }> {
  try {
    return { ok: true, member: await client.getChatMember(chatId, userId) };
  } catch (error) {
    if (error instanceof TelegramApiError && error.kind === "api" && (error.errorCode === 400 || error.errorCode === 403)) {
      return { ok: true, member: null };
    }
    return { ok: false, error: error instanceof Error ? error : new Error("Unknown Telegram error") };
  }
}

export function telegramUnavailable(correlationId: string, error: Error): NextResponse {
  logger.warn("community_telegram_check_failed", {
    correlationId,
    errorCode: error instanceof TelegramApiError ? error.code : "unknown",
  });
  return apiError(503, "unavailable", "Telegram could not confirm your permissions right now. Try again shortly.", correlationId);
}

export type AuthorizedCommunity = {
  community: CommunityRecord;
  roles: CommunityRole[];
  capabilities: Set<Capability>;
  liveMember: TelegramChatMember | null;
  client: TelegramClient;
};

/**
 * Per-request community authorization. The community id is only a selector:
 * authority comes from active Isnad roles intersected with the user's *live*
 * Telegram status. Unrelated users get 404 so private communities cannot be
 * discovered; role holders who lack the capability or the Telegram rights get 403.
 */
export async function authorizeCommunity(
  session: AdminSession,
  communityId: string,
  capability: Capability
): Promise<{ ok: true; auth: AuthorizedCommunity } | Failure> {
  const { correlationId } = session;
  const notFound = () => ({
    ok: false as const,
    response: apiError(404, "not_found", "Community not found.", correlationId),
  });

  const community = await getCommunityById(communityId);
  if (!community) return notFound();
  const roles = await getActiveRoles(community.id, session.actor.telegramUserId);

  const clientResult = telegramClientOrFailure(correlationId);
  if (!clientResult.ok) return clientResult;
  const live = await liveChatMember(clientResult.client, community.telegramChatId, session.actor.telegramUserId);
  if (!live.ok) {
    // Fail closed, but do not reveal existence to someone with no relationship.
    if (roles.length === 0) return notFound();
    return { ok: false, response: telegramUnavailable(correlationId, live.error) };
  }

  const resolution = resolveCapabilities(roles, live.member);
  if (resolution.roleCapabilities.size === 0) return notFound();
  if (roles.length > 0) {
    await markMembershipVerified(community.id, session.actor.telegramUserId, live.member?.status ?? "left");
  }

  if (community.status === "removed" && capability !== "community.view" && capability !== "audit.view") {
    return {
      ok: false,
      response: apiError(409, "invalid_state", "Isnad was removed from this community. Add the bot again to continue.", correlationId),
    };
  }
  if (!resolution.capabilities.has(capability)) {
    if (resolution.roleCapabilities.has(capability)) {
      return {
        ok: false,
        response: apiError(
          403,
          "telegram_rights_required",
          "Your current Telegram rights in this community don't allow this action.",
          correlationId
        ),
      };
    }
    return { ok: false, response: apiError(403, "forbidden", "Your Isnad role doesn't allow this action.", correlationId) };
  }

  return {
    ok: true,
    auth: {
      community,
      roles: resolution.effectiveRoles,
      capabilities: resolution.capabilities,
      liveMember: live.member,
      client: clientResult.client,
    },
  };
}

const MAX_JSON_BYTES = 16 * 1024;

export async function readJsonBody(
  request: Request,
  correlationId: string
): Promise<{ ok: true; body: Record<string, unknown> } | Failure> {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_JSON_BYTES) {
    return { ok: false, response: apiError(422, "validation_failed", "Request body is too large.", correlationId) };
  }
  if (!text.trim()) return { ok: true, body: {} };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: apiError(422, "validation_failed", "Body must be a JSON object.", correlationId) };
  }
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Runs a mutation at most once per (actor, scope, Idempotency-Key). A replay
 * with the same body returns the stored response; a different body is
 * rejected. Server errors release the key so the client can retry.
 */
export async function withIdempotency(
  request: Request,
  session: AdminSession,
  scope: string,
  body: unknown,
  handler: () => Promise<NextResponse>,
  options: { required: boolean } = { required: true }
): Promise<NextResponse> {
  const { correlationId } = session;
  const key = request.headers.get("idempotency-key");
  if (!key) {
    if (!options.required) return handler();
    return apiError(422, "idempotency_key_required", "An Idempotency-Key header is required.", correlationId);
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return apiError(422, "validation_failed", "Idempotency-Key has an invalid format.", correlationId);
  }

  const requestHash = createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
  const sql = getDatabase();
  const actorId = session.actor.telegramUserId;
  const inserted = await sql`
    INSERT INTO community_idempotency_keys (actor_telegram_user_id, scope, idempotency_key, request_hash)
    VALUES (${actorId}, ${scope}, ${key}, ${requestHash})
    ON CONFLICT DO NOTHING RETURNING idempotency_key
  `;

  if (inserted.length === 0) {
    const [existing] = await sql`
      SELECT request_hash, response_status, response_body FROM community_idempotency_keys
      WHERE actor_telegram_user_id = ${actorId} AND scope = ${scope} AND idempotency_key = ${key}
    `;
    if (!existing) return apiError(409, "request_in_progress", "Retry the request.", correlationId);
    if (existing.request_hash !== requestHash) {
      return apiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request.", correlationId);
    }
    if (existing.response_status === null) {
      return apiError(409, "request_in_progress", "This request is still being processed.", correlationId);
    }
    return apiJson(existing.response_body, correlationId, Number(existing.response_status), { "Idempotent-Replayed": "true" });
  }

  const release = () =>
    sql`
      DELETE FROM community_idempotency_keys
      WHERE actor_telegram_user_id = ${actorId} AND scope = ${scope} AND idempotency_key = ${key}
    `.catch(() => undefined);

  let response: NextResponse;
  try {
    response = await handler();
  } catch (error) {
    await release();
    throw error;
  }
  if (response.status >= 500) {
    await release();
    return response;
  }
  const responseBody = await response.clone().json().catch(() => null);
  await sql`
    UPDATE community_idempotency_keys
    SET response_status = ${response.status}, response_body = ${responseBody === null ? null : sql.json(responseBody as never)}
    WHERE actor_telegram_user_id = ${actorId} AND scope = ${scope} AND idempotency_key = ${key}
  `;
  return response;
}

/** Wraps a route handler so unexpected errors become a logged, content-free 500. */
export async function guarded(name: string, run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    const correlationId = randomUUID();
    logger.error("community_api_failed", {
      route: name,
      correlationId,
      errorCode:
        error instanceof TelegramApiError ? error.code : ((error as { code?: string })?.code ?? "unknown"),
    });
    return apiError(500, "unavailable", "Something went wrong. Try again shortly.", correlationId);
  }
}
