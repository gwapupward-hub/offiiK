import type { CitationRecord } from "@/lib/appTypes";

export const BOOKMARK_KINDS = [
  "ai_response",
  "quran",
  "hadith",
  "tafsir",
  "research",
  "arabic",
  "other",
] as const;

export type BookmarkKind = (typeof BOOKMARK_KINDS)[number];

export type BookmarkCollection = {
  id: string;
  name: string;
  description: string;
  bookmarkCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkRecord = {
  id: string;
  messageId?: string;
  collectionId?: string;
  kind: BookmarkKind;
  title: string;
  content: string;
  note: string;
  tags: string[];
  citations: CitationRecord[];
  sourceConversationId?: string;
  sourceConversationTitle?: string;
  createdAt: string;
  updatedAt: string;
};

export type StudyNote = {
  id: string;
  collectionId?: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeLibrary = {
  collections: BookmarkCollection[];
  bookmarks: BookmarkRecord[];
  notes: StudyNote[];
};
