import type { CommunityChatType, ModuleKey } from "@/lib/community/types";

export type AssistantResponseMode = "mention_only" | "mention_and_reply" | "qa_topics";
export type AnswerLength = "concise" | "balanced" | "detailed";

export type AssistantConfig = {
  enabled: boolean;
  responseMode: AssistantResponseMode;
  qaTopicIds: number[];
  responseLanguage: string;
  answerLength: AnswerLength;
  showSources: boolean;
  interactionRetentionDays: number;
  cooldownSeconds: number;
  maxRepliesPerHour: number;
  dailyAiBudget: number;
};

export type VerificationConfig = {
  enabled: boolean;
  trigger: "explicit_command";
  showEvidence: boolean;
  flagForScholarlyReview: boolean;
};

export type PublisherConfig = {
  enabled: boolean;
  /** Invariant: publishing always requires administrator approval. */
  approvalRequired: true;
  scheduledPostsEnabled: boolean;
  silentNotifications: boolean;
};

export type LearningConfig = {
  enabled: boolean;
  /** Invariant for the first release: lessons and quizzes start manually. */
  manualOnly: true;
  quizzesEnabled: boolean;
  publicRankings: boolean;
  studyCirclesEnabled: boolean;
};

export type CommunitySettings = {
  assistant: AssistantConfig;
  verification: VerificationConfig;
  publisher: PublisherConfig;
  learning: LearningConfig;
};

export type VersionedCommunitySettings = CommunitySettings & { version: number; timezone: string };

/** Initial configuration from the handoff's Step 5 table. Activation is still a separate step. */
export function defaultSettings(chatType: CommunityChatType): CommunitySettings {
  return {
    assistant: {
      enabled: chatType !== "channel",
      responseMode: "mention_only",
      qaTopicIds: [],
      responseLanguage: "auto",
      answerLength: "concise",
      showSources: true,
      interactionRetentionDays: 30,
      cooldownSeconds: 30,
      maxRepliesPerHour: 30,
      dailyAiBudget: 200,
    },
    verification: {
      // Channels support verification from the Mini App only (see moduleCompatibility).
      enabled: true,
      trigger: "explicit_command",
      showEvidence: true,
      flagForScholarlyReview: true,
    },
    publisher: {
      enabled: true,
      approvalRequired: true,
      scheduledPostsEnabled: false,
      silentNotifications: false,
    },
    learning: {
      enabled: true,
      manualOnly: true,
      quizzesEnabled: true,
      publicRankings: false,
      studyCirclesEnabled: false,
    },
  };
}

export type ValidationIssue = { path: string; message: string };

type FieldRule =
  | { type: "boolean"; const?: boolean }
  | { type: "integer"; min: number; max: number }
  | { type: "enum"; values: readonly string[] }
  | { type: "string"; pattern: RegExp; maxLength: number }
  | { type: "integerArray"; min: number; max: number; maxItems: number };

const SCHEMAS: Record<ModuleKey, Record<string, FieldRule>> = {
  assistant: {
    enabled: { type: "boolean" },
    responseMode: { type: "enum", values: ["mention_only", "mention_and_reply", "qa_topics"] },
    qaTopicIds: { type: "integerArray", min: 1, max: 2_147_483_647, maxItems: 20 },
    responseLanguage: { type: "string", pattern: /^(auto|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/, maxLength: 12 },
    answerLength: { type: "enum", values: ["concise", "balanced", "detailed"] },
    showSources: { type: "boolean" },
    interactionRetentionDays: { type: "integer", min: 0, max: 30 },
    cooldownSeconds: { type: "integer", min: 0, max: 3_600 },
    maxRepliesPerHour: { type: "integer", min: 1, max: 120 },
    dailyAiBudget: { type: "integer", min: 0, max: 2_000 },
  },
  verification: {
    enabled: { type: "boolean" },
    trigger: { type: "enum", values: ["explicit_command"] },
    showEvidence: { type: "boolean" },
    flagForScholarlyReview: { type: "boolean" },
  },
  publisher: {
    enabled: { type: "boolean" },
    approvalRequired: { type: "boolean", const: true },
    scheduledPostsEnabled: { type: "boolean" },
    silentNotifications: { type: "boolean" },
  },
  learning: {
    enabled: { type: "boolean" },
    manualOnly: { type: "boolean", const: true },
    quizzesEnabled: { type: "boolean" },
    publicRankings: { type: "boolean" },
    studyCirclesEnabled: { type: "boolean" },
  },
};

function checkField(path: string, rule: FieldRule, value: unknown): ValidationIssue | null {
  switch (rule.type) {
    case "boolean":
      if (typeof value !== "boolean") return { path, message: "Must be true or false." };
      if (rule.const !== undefined && value !== rule.const) {
        return { path, message: `Must remain ${rule.const} in this release.` };
      }
      return null;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value) || value < rule.min || value > rule.max) {
        return { path, message: `Must be an integer from ${rule.min} to ${rule.max}.` };
      }
      return null;
    case "enum":
      if (typeof value !== "string" || !rule.values.includes(value)) {
        return { path, message: `Must be one of: ${rule.values.join(", ")}.` };
      }
      return null;
    case "string":
      if (typeof value !== "string" || value.length > rule.maxLength || !rule.pattern.test(value)) {
        return { path, message: "Has an unsupported format." };
      }
      return null;
    case "integerArray":
      if (
        !Array.isArray(value) ||
        value.length > rule.maxItems ||
        value.some((item) => !Number.isInteger(item) || item < rule.min || item > rule.max) ||
        new Set(value).size !== value.length
      ) {
        return { path, message: `Must be up to ${rule.maxItems} unique positive integers.` };
      }
      return null;
  }
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a stored JSONB module config: unknown keys are dropped and
 * missing or invalid fields fall back to defaults. Used on read so a schema
 * change never crashes the dashboard.
 */
export function normalizeStoredSettings(
  chatType: CommunityChatType,
  stored: Partial<Record<ModuleKey, unknown>>
): CommunitySettings {
  const defaults = defaultSettings(chatType);
  const result = {} as Record<ModuleKey, Record<string, unknown>>;
  for (const key of Object.keys(SCHEMAS) as ModuleKey[]) {
    const base = { ...(defaults[key] as unknown as Record<string, unknown>) };
    const source = stored[key];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [field, rule] of Object.entries(SCHEMAS[key])) {
        const value = (source as Record<string, unknown>)[field];
        if (value !== undefined && !checkField(field, rule, value)) base[field] = value;
      }
    }
    result[key] = base;
  }
  return result as unknown as CommunitySettings;
}

export type SettingsPatch = {
  version: number;
  timezone?: string;
} & Partial<Record<ModuleKey, Record<string, unknown>>>;

export type SettingsPatchResult =
  | { ok: true; settings: CommunitySettings; timezone?: string; expectedVersion: number; changed: ModuleKey[] }
  | { ok: false; issues: ValidationIssue[] };

const PATCH_KEYS = new Set<string>(["version", "timezone", ...Object.keys(SCHEMAS)]);

/**
 * Strictly validates a partial settings update. Unknown keys are rejected,
 * invariants (approval-required publishing, manual learning) are enforced,
 * and incompatible modules cannot be enabled for the chat type.
 */
export function applySettingsPatch(
  chatType: CommunityChatType,
  current: CommunitySettings,
  body: unknown
): SettingsPatchResult {
  const issues: ValidationIssue[] = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, issues: [{ path: "", message: "Body must be a JSON object." }] };
  }
  const patch = body as Record<string, unknown>;

  for (const key of Object.keys(patch)) {
    if (!PATCH_KEYS.has(key)) issues.push({ path: key, message: "Unknown setting." });
  }

  const version = patch.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    issues.push({ path: "version", message: "The current settings version is required." });
  }

  let timezone: string | undefined;
  if (patch.timezone !== undefined) {
    if (isValidTimezone(patch.timezone)) timezone = patch.timezone;
    else issues.push({ path: "timezone", message: "Must be an IANA timezone such as Europe/London." });
  }

  const next = structuredClone(current) as unknown as Record<ModuleKey, Record<string, unknown>>;
  const changed: ModuleKey[] = [];
  for (const key of Object.keys(SCHEMAS) as ModuleKey[]) {
    const section = patch[key];
    if (section === undefined) continue;
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      issues.push({ path: key, message: "Must be an object." });
      continue;
    }
    for (const [field, value] of Object.entries(section as Record<string, unknown>)) {
      const rule = SCHEMAS[key][field];
      if (!rule) {
        issues.push({ path: `${key}.${field}`, message: "Unknown setting." });
        continue;
      }
      const issue = checkField(`${key}.${field}`, rule, value);
      if (issue) issues.push(issue);
      else next[key][field] = value;
    }
    changed.push(key);
  }

  const settings = next as unknown as CommunitySettings;
  for (const key of changed) {
    if (settings[key].enabled && moduleCompatibility(chatType)[key] === "incompatible") {
      issues.push({
        path: `${key}.enabled`,
        message: `${MODULE_LABELS[key]} is not available for a ${chatType}.`,
      });
    }
  }
  if (settings.assistant.responseMode === "qa_topics" && settings.assistant.qaTopicIds.length === 0) {
    issues.push({ path: "assistant.qaTopicIds", message: "Select at least one Q&A topic." });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, settings, timezone, expectedVersion: version as number, changed };
}

export const MODULE_LABELS: Readonly<Record<ModuleKey, string>> = {
  assistant: "Smart Group Assistant",
  verification: "Content Verification",
  publisher: "Channel Publisher",
  learning: "Community Learning",
};

export type ModuleCompatibility = "supported" | "mini_app_only" | "incompatible";

/** Broadcast channels have no member questions, so mention-based Q&A cannot work there. */
export function moduleCompatibility(chatType: CommunityChatType): Record<ModuleKey, ModuleCompatibility> {
  if (chatType === "channel") {
    return {
      assistant: "incompatible",
      verification: "mini_app_only",
      publisher: "supported",
      learning: "supported",
    };
  }
  return {
    assistant: "supported",
    verification: "supported",
    publisher: "supported",
    learning: "supported",
  };
}
