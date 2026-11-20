import { communityGlobalPause, MODULE_RUNTIME_RELEASED } from "@/lib/community/featureFlags";
import {
  MODULE_LABELS,
  moduleCompatibility,
  type CommunitySettings,
  type ModuleCompatibility,
} from "@/lib/community/settingsSchema";
import {
  MODULE_KEYS,
  type BotPermissionSnapshot,
  type CommunityChatType,
  type CommunityStatus,
  type ModuleKey,
  type TelegramChatMember,
  type TelegramChatPermissions,
} from "@/lib/community/types";

export function snapshotBotPermissions(
  member: TelegramChatMember,
  chatType: CommunityChatType,
  chatPermissions: TelegramChatPermissions | undefined,
  canReadAllGroupMessages: boolean
): BotPermissionSnapshot {
  const isAdministrator = member.status === "administrator" || member.status === "creator";
  const present =
    isAdministrator ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member !== false);

  let canSendMessages = false;
  let canSendPolls = false;
  if (chatType === "channel") {
    canSendMessages = isAdministrator && member.can_post_messages === true;
    canSendPolls = canSendMessages;
  } else if (isAdministrator) {
    canSendMessages = true;
    canSendPolls = true;
  } else if (member.status === "restricted") {
    canSendMessages = present && member.can_send_messages === true;
    canSendPolls = present && member.can_send_polls === true;
  } else if (member.status === "member") {
    canSendMessages = chatPermissions?.can_send_messages !== false;
    canSendPolls = chatPermissions?.can_send_polls !== false;
  }

  return {
    status: member.status,
    isAdministrator,
    canSendMessages,
    canSendPolls,
    canPostMessages: canSendMessages,
    canEditMessages: chatType === "channel" ? isAdministrator && member.can_edit_messages === true : canSendMessages,
    canDeleteMessages: isAdministrator && member.can_delete_messages === true,
    canPinMessages: isAdministrator && member.can_pin_messages === true,
    canManageTopics: isAdministrator && member.can_manage_topics === true,
    seesAllGroupMessages: chatType !== "channel" && present && (isAdministrator || canReadAllGroupMessages),
  };
}

export type PermissionRequirement = {
  key: keyof BotPermissionSnapshot;
  label: string;
  satisfied: boolean;
};

function requirement(
  snapshot: Partial<BotPermissionSnapshot>,
  key: keyof BotPermissionSnapshot,
  label: string
): PermissionRequirement {
  return { key, label, satisfied: snapshot[key] === true };
}

/** Telegram permissions the bot needs for a module, given the chat type and settings. */
export function moduleRequirements(
  module: ModuleKey,
  chatType: CommunityChatType,
  settings: CommunitySettings,
  snapshot: Partial<BotPermissionSnapshot>
): PermissionRequirement[] {
  switch (module) {
    case "assistant":
      // Every response mode relies on @mentions or topic messages, which Telegram
      // only delivers to bots that see all group messages (admin or privacy off).
      return [
        requirement(snapshot, "canSendMessages", "Send messages"),
        requirement(snapshot, "seesAllGroupMessages", "Receive @mentions (admin or privacy mode off)"),
      ];
    case "verification":
      return chatType === "channel" ? [] : [requirement(snapshot, "canSendMessages", "Send messages")];
    case "publisher":
      return chatType === "channel"
        ? [
            requirement(snapshot, "canPostMessages", "Post messages"),
            requirement(snapshot, "canEditMessages", "Edit messages (corrections)"),
          ]
        : [requirement(snapshot, "canSendMessages", "Send messages")];
    case "learning":
      return [
        requirement(snapshot, chatType === "channel" ? "canPostMessages" : "canSendMessages", "Send lesson announcements"),
        ...(settings.learning.quizzesEnabled ? [requirement(snapshot, "canSendPolls", "Send quiz polls")] : []),
      ];
  }
}

export type ModuleRuntimeState =
  | "disabled"
  | "incompatible"
  | "blocked_permissions"
  | "paused"
  | "awaiting_release"
  | "ready";

export type ModuleEvaluation = {
  key: ModuleKey;
  label: string;
  enabled: boolean;
  compatibility: ModuleCompatibility;
  requirements: PermissionRequirement[];
  missingPermissions: string[];
  runtimeReleased: boolean;
  state: ModuleRuntimeState;
};

/**
 * Single source of truth for whether a module may act. Every runtime path
 * (replies, publishing, learning announcements) must check `state === "ready"`.
 */
export function evaluateModules(
  chatType: CommunityChatType,
  status: CommunityStatus,
  settings: CommunitySettings,
  snapshot: Partial<BotPermissionSnapshot>,
  options: { globalPause?: boolean } = {}
): ModuleEvaluation[] {
  const compatibility = moduleCompatibility(chatType);
  const globalPause = options.globalPause ?? communityGlobalPause();
  return MODULE_KEYS.map((key) => {
    const enabled = settings[key].enabled;
    const requirements = compatibility[key] === "incompatible" ? [] : moduleRequirements(key, chatType, settings, snapshot);
    const missingPermissions = requirements.filter((item) => !item.satisfied).map((item) => item.label);
    const runtimeReleased = MODULE_RUNTIME_RELEASED[key];

    let state: ModuleRuntimeState;
    if (compatibility[key] === "incompatible") state = "incompatible";
    else if (!enabled) state = "disabled";
    else if (missingPermissions.length > 0) state = "blocked_permissions";
    else if (globalPause || status !== "active") state = "paused";
    else if (!runtimeReleased) state = "awaiting_release";
    else state = "ready";

    return {
      key,
      label: MODULE_LABELS[key],
      enabled,
      compatibility: compatibility[key],
      requirements,
      missingPermissions,
      runtimeReleased,
      state,
    };
  });
}

/** True when the community may perform an automated action for a module right now. */
export function moduleMayAct(
  module: ModuleKey,
  chatType: CommunityChatType,
  status: CommunityStatus,
  settings: CommunitySettings,
  snapshot: Partial<BotPermissionSnapshot>,
  options: { globalPause?: boolean } = {}
): boolean {
  return evaluateModules(chatType, status, settings, snapshot, options).find((item) => item.key === module)
    ?.state === "ready";
}

/** Enabled, compatible modules that are missing a required bot permission. */
export function blockedModules(evaluations: ModuleEvaluation[]): ModuleEvaluation[] {
  return evaluations.filter((item) => item.state === "blocked_permissions");
}
