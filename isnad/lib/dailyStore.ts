import { getDatabase } from "@/lib/db";
import type {
  DailyDashboard,
  DailyHadithItem,
  DailyProgress,
  DailyQuranItem,
  DailySection,
  DailyStreak,
  DailyVocabularyItem,
} from "@/lib/dailyTypes";

const DAY_MS = 86_400_000;

function dateNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - DAY_MS).toISOString().slice(0, 10);
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function mapQuran(row: Record<string, unknown>): DailyQuranItem {
  return {
    id: row.id as string,
    slug: row.slug as string,
    surahNumber: Number(row.surah_number),
    verseNumber: Number(row.verse_number),
    surahName: row.surah_name as string,
    arabicText: row.arabic_text as string,
    translation: row.translation as string,
    reflection: row.reflection as string,
    sourceLabel: row.source_label as string,
  };
}

function mapHadith(row: Record<string, unknown>): DailyHadithItem {
  return {
    id: row.id as string,
    slug: row.slug as string,
    summary: row.summary as string,
    lesson: row.lesson as string,
    narrator: (row.narrator as string | null) ?? undefined,
    collection: row.collection as string,
    authenticity: row.authenticity as string,
    sourceLabel: row.source_label as string,
  };
}

function mapVocabulary(row: Record<string, unknown>): DailyVocabularyItem {
  return {
    id: row.id as string,
    slug: row.slug as string,
    arabic: row.arabic as string,
    transliteration: row.transliteration as string,
    meaning: row.meaning as string,
    rootLetters: row.root_letters as string,
    explanation: row.explanation as string,
    quranReference: (row.quran_reference as string | null) ?? undefined,
  };
}

function emptyProgress(): DailyProgress {
  return {
    quranRead: false,
    hadithRead: false,
    vocabularyReviewed: false,
    completed: false,
    completedCount: 0,
  };
}

async function getProgress(userId: string, date: string): Promise<DailyProgress> {
  const sql = getDatabase();
  const [row] = await sql`
    SELECT quran_read, hadith_read, vocabulary_reviewed, completed_at
    FROM daily_checkins
    WHERE user_id = ${userId} AND content_date = ${date}::date
  `;
  if (!row) return emptyProgress();

  const quranRead = Boolean(row.quran_read);
  const hadithRead = Boolean(row.hadith_read);
  const vocabularyReviewed = Boolean(row.vocabulary_reviewed);
  return {
    quranRead,
    hadithRead,
    vocabularyReviewed,
    completed: Boolean(row.completed_at),
    completedCount: [quranRead, hadithRead, vocabularyReviewed].filter(Boolean).length,
  };
}

async function getStreak(userId: string, today: string): Promise<DailyStreak> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT content_date::text AS content_date
    FROM daily_checkins
    WHERE user_id = ${userId} AND completed_at IS NOT NULL
    ORDER BY content_date ASC
  `;
  const dates = rows.map((row) => row.content_date as string);
  if (dates.length === 0) {
    return { current: 0, longest: 0, totalCompletedDays: 0 };
  }

  let longest = 1;
  let running = 1;
  for (let index = 1; index < dates.length; index += 1) {
    if (previousDate(dates[index]) === dates[index - 1]) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 1;
    }
  }

  const completed = new Set(dates);
  let cursor = completed.has(today) ? today : previousDate(today);
  let current = 0;
  while (completed.has(cursor)) {
    current += 1;
    cursor = previousDate(cursor);
  }

  return {
    current,
    longest,
    totalCompletedDays: dates.length,
    lastCompletedDate: dates.at(-1),
  };
}

async function getPools() {
  const sql = getDatabase();
  const [quranRows, hadithRows, vocabularyRows] = await Promise.all([
    sql`
      SELECT id::text AS id, slug, surah_number, verse_number, surah_name,
             arabic_text, translation, reflection, source_label
      FROM daily_quran_items
      WHERE is_published = true
      ORDER BY slug
    `,
    sql`
      SELECT id::text AS id, slug, summary, lesson, narrator, collection,
             authenticity, source_label
      FROM daily_hadith_items
      WHERE is_published = true
      ORDER BY slug
    `,
    sql`
      SELECT id::text AS id, slug, arabic, transliteration, meaning,
             root_letters, explanation, quran_reference
      FROM daily_vocabulary_items
      WHERE is_published = true
      ORDER BY slug
    `,
  ]);

  if (!quranRows.length || !hadithRows.length || !vocabularyRows.length) {
    throw new Error("Daily knowledge content has not been seeded.");
  }

  return {
    quran: quranRows.map(mapQuran),
    hadith: hadithRows.map(mapHadith),
    vocabulary: vocabularyRows.map(mapVocabulary),
  };
}

export function dateForOffset(offsetMinutes: number, now = new Date()): string {
  const safeOffset = Math.min(Math.max(Math.trunc(offsetMinutes), -840), 840);
  return new Date(now.getTime() - safeOffset * 60_000).toISOString().slice(0, 10);
}

export async function getDailyDashboard(
  userId: string,
  date: string
): Promise<DailyDashboard> {
  const [pools, progress, streak] = await Promise.all([
    getPools(),
    getProgress(userId, date),
    getStreak(userId, date),
  ]);
  const day = dateNumber(date);

  return {
    date,
    displayDate: displayDate(date),
    quran: pools.quran[Math.abs(day) % pools.quran.length],
    hadith: pools.hadith[Math.abs(day + 11) % pools.hadith.length],
    vocabulary: pools.vocabulary[Math.abs(day + 23) % pools.vocabulary.length],
    progress,
    streak,
  };
}

export async function setDailyProgress(input: {
  userId: string;
  date: string;
  section: DailySection;
  completed: boolean;
}): Promise<DailyDashboard> {
  const sql = getDatabase();
  const isQuran = input.section === "quran";
  const isHadith = input.section === "hadith";
  const isVocabulary = input.section === "vocabulary";

  await sql`
    INSERT INTO daily_checkins (
      user_id, content_date, quran_read, hadith_read, vocabulary_reviewed
    ) VALUES (
      ${input.userId}, ${input.date}::date,
      ${isQuran && input.completed},
      ${isHadith && input.completed},
      ${isVocabulary && input.completed}
    )
    ON CONFLICT (user_id, content_date) DO UPDATE SET
      quran_read = CASE
        WHEN ${isQuran} THEN ${input.completed}
        ELSE daily_checkins.quran_read
      END,
      hadith_read = CASE
        WHEN ${isHadith} THEN ${input.completed}
        ELSE daily_checkins.hadith_read
      END,
      vocabulary_reviewed = CASE
        WHEN ${isVocabulary} THEN ${input.completed}
        ELSE daily_checkins.vocabulary_reviewed
      END,
      updated_at = now()
  `;

  await sql`
    UPDATE daily_checkins
    SET completed_at = CASE
      WHEN quran_read AND hadith_read AND vocabulary_reviewed
        THEN COALESCE(completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
    WHERE user_id = ${input.userId} AND content_date = ${input.date}::date
  `;

  return getDailyDashboard(input.userId, input.date);
}
