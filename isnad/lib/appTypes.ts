export type AnswerLength = "concise" | "balanced" | "detailed";
export type CitationDepth = "standard" | "detailed";
export type ThemePreference = "system" | "light" | "dark";
export type ConversationChannel = "telegram" | "mini_app";

export type UserSettings = {
  language: string;
  answerLength: AnswerLength;
  showArabic: boolean;
  transliteration: boolean;
  citationDepth: CitationDepth;
  madhhabContext: string;
  theme: ThemePreference;
  memoryEnabled: boolean;
};

export const DEFAULT_SETTINGS: UserSettings = {
  language: "en",
  answerLength: "balanced",
  showArabic: true,
  transliteration: false,
  citationDepth: "standard",
  madhhabContext: "balanced",
  theme: "system",
  memoryEnabled: true,
};

export type RoutingFlags = {
  routedToFinance: boolean;
  routedToTafsir: boolean;
  routedToHadith: boolean;
  routedToFiqh: boolean;
  routedToSeerah: boolean;
  routedToAqidah: boolean;
  routedToArabic: boolean;
  routedToDawahTarbiyah: boolean;
};

export type CitationRecord = {
  ordinal: number;
  label: string;
  sourceType: string;
  work?: string;
  locator?: string;
  url?: string;
  verified: boolean;
};

export type ConversationSummary = {
  id: string;
  channel: ConversationChannel;
  title: string;
  pinnedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  routing: Partial<RoutingFlags>;
  citations: CitationRecord[];
  createdAt: string;
};

export type UserProfile = {
  userId: string;
  telegramUserId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  bio: string;
  languageCode?: string;
};
