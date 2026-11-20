import { evaluateModules, type ModuleEvaluation } from "@/lib/community/botPermissions";
import { communityGlobalPause } from "@/lib/community/featureFlags";
import type { VersionedCommunitySettings } from "@/lib/community/settingsSchema";
import type {
  BotPermissionSnapshot,
  Capability,
  CommunityRecord,
  CommunityRole,
  TelegramChatMember,
} from "@/lib/community/types";

export type CommunityView = {
  id: string;
  title: string;
  chatType: CommunityRecord["chatType"];
  isForum: boolean;
  status: CommunityRecord["status"];
  timezone: string;
  activatedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  globalPause: boolean;
  bot: { status: string; checkedAt: string | null; permissions: Partial<BotPermissionSnapshot> };
  settings: VersionedCommunitySettings;
  modules: ModuleEvaluation[];
  activation: { ready: boolean; blockers: string[] };
  viewer: {
    roles: CommunityRole[];
    capabilities: Capability[];
    telegramStatus: TelegramChatMember["status"] | "none";
    isAnonymousAdmin: boolean;
  };
};

export function buildCommunityView(input: {
  community: CommunityRecord;
  settings: VersionedCommunitySettings;
  snapshot?: Partial<BotPermissionSnapshot>;
  roles: CommunityRole[];
  capabilities: Set<Capability>;
  liveMember: TelegramChatMember | null;
}): CommunityView {
  const { community, settings } = input;
  const snapshot = input.snapshot ?? community.botPermissions;
  const globalPause = communityGlobalPause();
  const modules = evaluateModules(community.chatType, community.status, settings, snapshot, { globalPause });

  const blockers: string[] = [];
  if (community.status !== "pending") blockers.push(`Community is ${community.status}.`);
  if (!snapshot.status || snapshot.status === "left" || snapshot.status === "kicked") {
    blockers.push("Isnad is not a member of this chat.");
  }
  for (const item of modules) {
    if (item.state === "blocked_permissions") {
      blockers.push(`${item.label}: missing ${item.missingPermissions.join(", ")}.`);
    }
  }

  return {
    id: community.id,
    title: community.title,
    chatType: community.chatType,
    isForum: community.isForum,
    status: community.status,
    timezone: community.timezone,
    activatedAt: community.activatedAt,
    pausedAt: community.pausedAt,
    pauseReason: community.pauseReason,
    globalPause,
    bot: { status: community.botStatus, checkedAt: community.botPermissionsCheckedAt, permissions: snapshot },
    settings,
    modules,
    activation: { ready: blockers.length === 0, blockers },
    viewer: {
      roles: input.roles,
      capabilities: [...input.capabilities].sort(),
      telegramStatus: input.liveMember?.status ?? "none",
      isAnonymousAdmin: Boolean(input.liveMember?.is_anonymous),
    },
  };
}

export type CommunityRouteContext = { params: Promise<{ communityId: string }> };
