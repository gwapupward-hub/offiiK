export type CommunityChatType = "group" | "supergroup" | "channel";

export type CommunityStatus = "pending" | "active" | "paused" | "permission_lost" | "removed";

export type CommunityRole =
  | "owner"
  | "community_manager"
  | "content_editor"
  | "source_reviewer"
  | "publisher"
  | "analytics_viewer";

export const COMMUNITY_ROLES: readonly CommunityRole[] = [
  "owner",
  "community_manager",
  "content_editor",
  "source_reviewer",
  "publisher",
  "analytics_viewer",
];

export type ModuleKey = "assistant" | "verification" | "publisher" | "learning";

export const MODULE_KEYS: readonly ModuleKey[] = [
  "assistant",
  "verification",
  "publisher",
  "learning",
];

export type Capability =
  | "community.view"
  | "community.activate"
  | "community.pause"
  | "community.resume"
  | "settings.update"
  | "roles.manage"
  | "audit.view"
  | "analytics.view"
  | "content.edit"
  | "content.review"
  | "content.publish";

/** Telegram ChatMember.status values. */
export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export type TelegramUserRef = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChatRef = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  is_forum?: boolean;
};

/** Superset of the Bot API ChatMember variants; absent flags mean "not granted". */
export type TelegramChatMember = {
  status: ChatMemberStatus;
  user: TelegramUserRef;
  is_anonymous?: boolean;
  can_manage_chat?: boolean;
  can_change_info?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
  is_member?: boolean;
  can_send_messages?: boolean;
  can_send_polls?: boolean;
};

export type TelegramChatPermissions = {
  can_send_messages?: boolean;
  can_send_polls?: boolean;
};

export type TelegramChatFull = TelegramChatRef & {
  permissions?: TelegramChatPermissions;
};

export type BotPermissionSnapshot = {
  status: ChatMemberStatus | "unknown";
  isAdministrator: boolean;
  canSendMessages: boolean;
  canSendPolls: boolean;
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canPinMessages: boolean;
  canManageTopics: boolean;
  /** True when Telegram delivers ordinary group messages (privacy mode off or bot is admin). */
  seesAllGroupMessages: boolean;
};

export type CommunityRecord = {
  id: string;
  telegramChatId: number;
  chatType: CommunityChatType;
  title: string;
  isForum: boolean;
  status: CommunityStatus;
  timezone: string;
  installedByTelegramUserId: number | null;
  botStatus: string;
  botPermissions: Partial<BotPermissionSnapshot>;
  botPermissionsCheckedAt: string | null;
  activatedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  createdAt: string;
  updatedAt: string;
};
