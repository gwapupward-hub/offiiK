export type DailySection = "quran" | "hadith" | "vocabulary";

export type DailyQuranItem = {
  id: string;
  slug: string;
  surahNumber: number;
  verseNumber: number;
  surahName: string;
  arabicText: string;
  translation: string;
  reflection: string;
  sourceLabel: string;
};

export type DailyHadithItem = {
  id: string;
  slug: string;
  summary: string;
  lesson: string;
  narrator?: string;
  collection: string;
  authenticity: string;
  sourceLabel: string;
};

export type DailyVocabularyItem = {
  id: string;
  slug: string;
  arabic: string;
  transliteration: string;
  meaning: string;
  rootLetters: string;
  explanation: string;
  quranReference?: string;
};

export type DailyProgress = {
  quranRead: boolean;
  hadithRead: boolean;
  vocabularyReviewed: boolean;
  completed: boolean;
  completedCount: number;
};

export type DailyStreak = {
  current: number;
  longest: number;
  totalCompletedDays: number;
  lastCompletedDate?: string;
};

export type DailyDashboard = {
  date: string;
  displayDate: string;
  quran: DailyQuranItem;
  hadith: DailyHadithItem;
  vocabulary: DailyVocabularyItem;
  progress: DailyProgress;
  streak: DailyStreak;
};
