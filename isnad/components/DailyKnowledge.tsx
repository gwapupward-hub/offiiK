"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DailyDashboard,
  DailyProgress,
  DailySection,
} from "@/lib/dailyTypes";

type AuthorizedFetch = (url: string, options?: RequestInit) => Promise<Response>;

type DailyKnowledgeProps = {
  authenticated: boolean;
  authorizedFetch: AuthorizedFetch;
};

export default function DailyKnowledge({
  authenticated,
  authorizedFetch,
}: DailyKnowledgeProps) {
  const [dashboard, setDashboard] = useState<DailyDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [busySection, setBusySection] = useState<DailySection | null>(null);
  const [error, setError] = useState("");

  const offsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/daily?offset=${offsetMinutes}`);
      const data = (await response.json().catch(() => ({}))) as {
        dashboard?: DailyDashboard;
        error?: string;
      };
      if (!response.ok || !data.dashboard) {
        setError(data.error ?? "Unable to load today’s knowledge.");
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setError("Unable to load today’s knowledge.");
    } finally {
      setLoading(false);
    }
  }, [authenticated, authorizedFetch, offsetMinutes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateSection(section: DailySection, completed: boolean) {
    setBusySection(section);
    setError("");
    try {
      const response = await authorizedFetch("/api/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, completed, offsetMinutes }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        dashboard?: DailyDashboard;
        error?: string;
      };
      if (!response.ok || !data.dashboard) {
        setError(data.error ?? "Unable to update today’s progress.");
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setError("Unable to update today’s progress.");
    } finally {
      setBusySection(null);
    }
  }

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-8">
        <EmptyAccountState />
      </section>
    );
  }

  if (loading && !dashboard) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 px-5 py-8">
        <div className="h-32 animate-pulse rounded-3xl border opacity-40" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-56 animate-pulse rounded-3xl border opacity-40" />
        ))}
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-8">
        <p className="rounded-2xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-4 py-3 text-sm text-[#7a1f1f]">
          {error || "Daily knowledge is unavailable."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold"
        >
          Try again
        </button>
      </section>
    );
  }

  const percent = Math.round((dashboard.progress.completedCount / 3) * 100);

  return (
    <section className="mx-auto max-w-3xl px-5 py-8">
      <div className="rounded-3xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-50">
              Today’s knowledge
            </p>
            <h2 className="mt-1 font-display text-2xl">{dashboard.displayDate}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-65">
              Read one Qur’an passage, one authentic hadith lesson, and one Arabic word.
            </p>
          </div>
          <div className="min-w-28 rounded-2xl border px-4 py-3 text-center">
            <p className="text-2xl font-bold">{percent}%</p>
            <p className="text-[11px] uppercase tracking-wide opacity-55">
              {dashboard.progress.completedCount}/3 complete
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Current streak" value={`${dashboard.streak.current} day${dashboard.streak.current === 1 ? "" : "s"}`} />
          <Stat label="Longest streak" value={`${dashboard.streak.longest} day${dashboard.streak.longest === 1 ? "" : "s"}`} />
          <Stat label="Completed days" value={String(dashboard.streak.totalCompletedDays)} />
        </div>

        {dashboard.progress.completed && (
          <p className="mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold">
            Today’s set is complete. Return tomorrow to continue the streak.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-3 py-2 text-xs text-[#7a1f1f]">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-5">
        <KnowledgeCard
          eyebrow="Daily Qur’an"
          title={`${dashboard.quran.surahName} ${dashboard.quran.surahNumber}:${dashboard.quran.verseNumber}`}
          completed={dashboard.progress.quranRead}
          busy={busySection === "quran"}
          onToggle={(completed) => updateSection("quran", completed)}
        >
          <p dir="rtl" lang="ar" className="mt-5 text-right font-serif text-3xl leading-loose">
            {dashboard.quran.arabicText}
          </p>
          <p className="mt-4 text-base leading-relaxed">{dashboard.quran.translation}</p>
          <div className="mt-4 rounded-2xl border px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
              Reflection
            </p>
            <p className="mt-1 text-sm leading-relaxed opacity-75">
              {dashboard.quran.reflection}
            </p>
          </div>
          <p className="mt-3 text-xs opacity-50">
            Source: {dashboard.quran.sourceLabel}, {dashboard.quran.surahNumber}:{dashboard.quran.verseNumber}
          </p>
        </KnowledgeCard>

        <KnowledgeCard
          eyebrow="Daily Hadith"
          title={dashboard.hadith.sourceLabel}
          completed={dashboard.progress.hadithRead}
          busy={busySection === "hadith"}
          onToggle={(completed) => updateSection("hadith", completed)}
        >
          <p className="mt-5 text-base leading-relaxed">{dashboard.hadith.summary}</p>
          <div className="mt-4 rounded-2xl border px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
              Practical lesson
            </p>
            <p className="mt-1 text-sm leading-relaxed opacity-75">
              {dashboard.hadith.lesson}
            </p>
          </div>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            {dashboard.hadith.narrator && (
              <Meta label="Narrator" value={dashboard.hadith.narrator} />
            )}
            <Meta label="Collection" value={dashboard.hadith.collection} />
            <Meta label="Authenticity" value={dashboard.hadith.authenticity} />
          </dl>
        </KnowledgeCard>

        <KnowledgeCard
          eyebrow="Arabic Vocabulary"
          title={dashboard.vocabulary.meaning}
          completed={dashboard.progress.vocabularyReviewed}
          busy={busySection === "vocabulary"}
          onToggle={(completed) => updateSection("vocabulary", completed)}
        >
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p dir="rtl" lang="ar" className="font-serif text-5xl leading-tight">
                {dashboard.vocabulary.arabic}
              </p>
              <p className="mt-2 text-sm font-semibold">{dashboard.vocabulary.transliteration}</p>
            </div>
            <div className="rounded-2xl border px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">Root</p>
              <p dir="rtl" lang="ar" className="mt-1 text-2xl tracking-widest">
                {dashboard.vocabulary.rootLetters}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed opacity-75">
            {dashboard.vocabulary.explanation}
          </p>
          {dashboard.vocabulary.quranReference && (
            <p className="mt-3 text-xs opacity-50">
              Qur’an reference for study: {dashboard.vocabulary.quranReference}
            </p>
          )}
        </KnowledgeCard>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <a href="/telegram/learn" className="rounded-full border px-4 py-2 text-xs font-semibold">
          Continue guided learning
        </a>
        <a href="/telegram/library" className="rounded-full border px-4 py-2 text-xs font-semibold">
          Open bookmarks &amp; notes
        </a>
      </div>

      <p className="mt-5 text-xs leading-relaxed opacity-50">
        Daily cards are educational summaries. Qur’an references and hadith collections are shown so users can return to the source.
      </p>
    </section>
  );
}

function KnowledgeCard({
  eyebrow,
  title,
  completed,
  busy,
  onToggle,
  children,
}: {
  eyebrow: string;
  title: string;
  completed: boolean;
  busy: boolean;
  onToggle: (completed: boolean) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-45">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-display text-xl">{title}</h3>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onToggle(!completed)}
          className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          aria-pressed={completed}
        >
          {busy ? "Saving…" : completed ? "Completed" : "Mark complete"}
        </button>
      </div>
      {children}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-45">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <dt className="font-semibold opacity-50">{label}</dt>
      <dd className="mt-0.5 leading-relaxed">{value}</dd>
    </div>
  );
}

function EmptyAccountState() {
  return (
    <p className="rounded-2xl border px-4 py-3 text-sm opacity-70">
      Open this Mini App from @the_isnad_bot to use daily progress and streak tracking.
    </p>
  );
}

export function progressForSection(
  progress: DailyProgress,
  section: DailySection
): boolean {
  if (section === "quran") return progress.quranRead;
  if (section === "hadith") return progress.hadithRead;
  return progress.vocabularyReviewed;
}
