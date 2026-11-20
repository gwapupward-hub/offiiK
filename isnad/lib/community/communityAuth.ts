import type {
  Capability,
  ChatMemberStatus,
  CommunityRole,
  TelegramChatMember,
} from "@/lib/community/types";

/** Application roles → capabilities. Roles never substitute for Telegram rights. */
export const ROLE_CAPABILITIES: Readonly<Record<CommunityRole, readonly Capability[]>> = {
  owner: [
    "community.view",
    "community.activate",
    "community.pause",
    "community.resume",
    "settings.update",
    "roles.manage",
    "audit.view",
    "analytics.view",
    "content.edit",
    "content.publish",
  ],
  community_manager: [
    "community.view",
    "community.pause",
    "community.resume",
    "settings.update",
    "audit.view",
    "analytics.view",
    "content.edit",
  ],
  content_editor: ["community.view", "content.edit"],
  source_reviewer: ["community.view", "content.review"],
  publisher: ["community.view", "content.publish"],
  analytics_viewer: ["community.view", "analytics.view"],
};

export type TelegramAuthority = "creator" | "administrator" | "member" | "none";

/**
 * The live Telegram authority each capability requires. High-impact actions
 * need a current administrator; read-only and drafting work needs current
 * membership of the chat.
 */
export const CAPABILITY_TELEGRAM_REQUIREMENT: Readonly<Record<Capability, "administrator" | "member">> = {
  "community.view": "member",
  "community.activate": "administrator",
  "community.pause": "administrator",
  "community.resume": "administrator",
  "settings.update": "administrator",
  "roles.manage": "administrator",
  "audit.view": "administrator",
  "analytics.view": "member",
  "content.edit": "member",
  "content.review": "member",
  "content.publish": "administrator",
};

export function telegramAuthority(member: Pick<TelegramChatMember, "status" | "is_member"> | null): TelegramAuthority {
  if (!member) return "none";
  const status: ChatMemberStatus = member.status;
  if (status === "creator") return "creator";
  if (status === "administrator") return "administrator";
  if (status === "member") return "member";
  if (status === "restricted" && member.is_member !== false) return "member";
  return "none";
}

function meets(authority: TelegramAuthority, required: "administrator" | "member"): boolean {
  if (required === "administrator") return authority === "creator" || authority === "administrator";
  return authority !== "none";
}

export type CapabilityResolution = {
  /** Roles held in Isnad, plus the implicit owner role of the Telegram chat creator. */
  effectiveRoles: CommunityRole[];
  /** Capabilities granted by roles, before the live Telegram check. */
  roleCapabilities: Set<Capability>;
  /** Capabilities usable right now (role ∩ live Telegram authority). */
  capabilities: Set<Capability>;
  authority: TelegramAuthority;
};

/**
 * Combines delegated roles with live Telegram authority. The Telegram chat
 * creator is always an implicit owner, which is the owner-recovery path when
 * the original Isnad owner leaves or loses rights.
 */
export function resolveCapabilities(
  roles: readonly CommunityRole[],
  liveMember: Pick<TelegramChatMember, "status" | "is_member"> | null
): CapabilityResolution {
  const authority = telegramAuthority(liveMember);
  const effectiveRoles = new Set<CommunityRole>(roles);
  if (authority === "creator") effectiveRoles.add("owner");

  const roleCapabilities = new Set<Capability>();
  for (const role of effectiveRoles) {
    for (const capability of ROLE_CAPABILITIES[role]) roleCapabilities.add(capability);
  }

  const capabilities = new Set<Capability>();
  for (const capability of roleCapabilities) {
    if (meets(authority, CAPABILITY_TELEGRAM_REQUIREMENT[capability])) capabilities.add(capability);
  }

  return { effectiveRoles: [...effectiveRoles], roleCapabilities, capabilities, authority };
}

/** A live administrator (or creator) may claim an unowned community. */
export function mayClaim(liveMember: Pick<TelegramChatMember, "status"> | null): boolean {
  return liveMember?.status === "creator" || liveMember?.status === "administrator";
}

/** Roles an owner may delegate. Ownership changes go through a dedicated flow. */
export const DELEGABLE_ROLES: readonly CommunityRole[] = [
  "community_manager",
  "content_editor",
  "source_reviewer",
  "publisher",
  "analytics_viewer",
];
