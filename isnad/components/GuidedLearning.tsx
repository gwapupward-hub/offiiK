"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  LearningCourse,
  LearningCourseSummary,
  LearningDashboard,
  LearningLesson,
  LearningLessonSummary,
} from "@/lib/learningTypes";

type AuthorizedFetch = (url: string, options?: RequestInit) => Promise<Response>;

type LessonView = {
  lesson: LearningLesson;
  course: { id: string; slug: string; title: string };
  module: { id: string; title: string };
  previousLesson?: { id: string; title: string };
  nextLesson?: { id: string; title: string };
};

type GuidedLearningProps = {
  authenticated: boolean;
  authorizedFetch: AuthorizedFetch;
};

export default function GuidedLearning({
  authenticated,
  authorizedFetch,
}: GuidedLearningProps) {
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null);
  const [course, setCourse] = useState<LearningCourse | null>(null);
  const [lessonView, setLessonView] = useState<LessonView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const response = await authorizedFetch("/api/learning", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to load learning paths.");
      }
      setDashboard(data.dashboard as LearningDashboard);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load learning paths.");
    } finally {
      setLoading(false);
    }
  }, [authenticated, authorizedFetch]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function loadCourse(slug: string) {
    setLoading(true);
    setError("");
    setLessonView(null);
    try {
      const response = await authorizedFetch(`/api/learning/courses/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to load course.");
      }
      setCourse(data.course as LearningCourse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load course.");
    } finally {
      setLoading(false);
    }
  }

  async function enroll(selected: LearningCourseSummary | LearningCourse) {
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(
        `/api/learning/courses/${encodeURIComponent(selected.slug)}`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to start course.");
      }
      setCourse(data.course as LearningCourse);
      await loadDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start course.");
    } finally {
      setBusy(false);
    }
  }

  async function openLesson(lesson: LearningLessonSummary) {
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/learning/lessons/${lesson.id}`, {
        method: lesson.status === "completed" ? "GET" : "PATCH",
        headers: lesson.status === "completed" ? undefined : { "Content-Type": "application/json" },
        body: lesson.status === "completed" ? undefined : JSON.stringify({ status: "in_progress" }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to open lesson.");
      }
      setLessonView(data.lesson as LessonView);
      await Promise.all([loadDashboard(), course ? refreshCourse(course.slug) : Promise.resolve()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function openLessonById(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/learning/lessons/${id}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to open lesson.");
      }
      setLessonView(data.lesson as LessonView);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshCourse(slug: string) {
    const response = await authorizedFetch(`/api/learning/courses/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as { course: LearningCourse };
    setCourse(data.course);
  }

  async function updateLessonStatus(status: "in_progress" | "completed") {
    if (!lessonView) return;
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/learning/lessons/${lessonView.lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to update progress.");
      }
      setLessonView(data.lesson as LessonView);
      await Promise.all([loadDashboard(), refreshCourse(lessonView.course.slug)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update progress.");
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-3xl border px-5 py-6">
          <h2 className="font-display text-2xl">Guided Learning</h2>
          <p className="mt-3 text-sm leading-relaxed opacity-70">
            Open this Mini App from @the_isnad_bot to enroll in courses and synchronize lesson progress.
          </p>
        </div>
      </section>
    );
  }

  if (loading && !dashboard && !course) {
    return <LoadingCards />;
  }

  if (lessonView) {
    return (
      <LessonReader
        view={lessonView}
        busy={busy}
        error={error}
        onBack={() => setLessonView(null)}
        onStatusChange={updateLessonStatus}
        onNavigate={openLessonById}
      />
    );
  }

  if (course) {
    return (
      <CourseDetail
        course={course}
        busy={busy}
        error={error}
        onBack={() => setCourse(null)}
        onEnroll={() => enroll(course)}
        onOpenLesson={openLesson}
      />
    );
  }

  return (
    <LearningHome
      dashboard={dashboard}
      loading={loading}
      error={error}
      onOpenCourse={loadCourse}
    />
  );
}

function LearningHome({
  dashboard,
  loading,
  error,
  onOpenCourse,
}: {
  dashboard: LearningDashboard | null;
  loading: boolean;
  error: string;
  onOpenCourse: (slug: string) => Promise<void>;
}) {
  const active = dashboard?.activeCourse;
  return (
    <section className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-45">
            Structured study
          </p>
          <h2 className="mt-1 font-display text-3xl">Guided Learning Paths</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-65">
            Study in sequence, complete lessons, and continue from where you stopped.
          </p>
        </div>
        <a href="/telegram/library" className="rounded-full border px-3 py-1.5 text-xs font-semibold">
          Notes &amp; bookmarks
        </a>
      </div>

      {error && <ErrorNotice message={error} />}

      {dashboard && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Enrolled" value={dashboard.enrolledCourses} />
          <Stat label="Courses done" value={dashboard.completedCourses} />
          <Stat label="Lessons done" value={dashboard.completedLessons} />
          <Stat label="Available" value={dashboard.totalLessons} />
        </div>
      )}

      {active && (
        <button
          type="button"
          onClick={() => void onOpenCourse(active.slug)}
          className="mt-7 w-full rounded-3xl border p-5 text-left"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
            Continue learning
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl">{active.title}</h3>
              <p className="mt-1 text-sm opacity-65">
                {active.nextLessonTitle ? `Next: ${active.nextLessonTitle}` : "Review the completed path"}
              </p>
            </div>
            <span className="text-sm font-semibold">{active.progressPercent}%</span>
          </div>
          <ProgressBar percent={active.progressPercent} />
        </button>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h3 className="font-display text-xl">Course catalog</h3>
        {loading && <span className="text-xs opacity-50">Refreshing…</span>}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {dashboard?.courses.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => void onOpenCourse(item.slug)}
            className="rounded-3xl border p-5 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-50">
              <span>{item.subject}</span>
              <span>{item.level}</span>
            </div>
            <h4 className="mt-3 font-display text-xl">{item.title}</h4>
            <p className="mt-2 text-sm leading-relaxed opacity-65">{item.description}</p>
            <div className="mt-4 flex items-center justify-between text-xs opacity-60">
              <span>{item.totalLessons} lessons</span>
              <span>{item.estimatedMinutes} min</span>
            </div>
            {item.enrolled && (
              <>
                <ProgressBar percent={item.progressPercent} />
                <p className="mt-2 text-xs font-semibold">{item.progressPercent}% complete</p>
              </>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function CourseDetail({
  course,
  busy,
  error,
  onBack,
  onEnroll,
  onOpenLesson,
}: {
  course: LearningCourse;
  busy: boolean;
  error: string;
  onBack: () => void;
  onEnroll: () => Promise<void>;
  onOpenLesson: (lesson: LearningLessonSummary) => Promise<void>;
}) {
  const lessons = useMemo(() => course.modules.flatMap((module) => module.lessons), [course]);
  return (
    <section className="mx-auto max-w-3xl px-5 py-8">
      <button type="button" onClick={onBack} className="rounded-full border px-3 py-1.5 text-xs">
        Back to courses
      </button>

      <div className="mt-6 rounded-3xl border p-6">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-50">
          <span>{course.subject}</span><span>•</span><span>{course.level}</span><span>•</span>
          <span>{course.estimatedMinutes} minutes</span>
        </div>
        <h2 className="mt-3 font-display text-3xl">{course.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-70">{course.description}</p>

        {course.enrolled ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{course.completedLessons} of {course.totalLessons} lessons</span>
              <span>{course.progressPercent}%</span>
            </div>
            <ProgressBar percent={course.progressPercent} />
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onEnroll()}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{
              background: "var(--tg-theme-button-color, var(--pine))",
              color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
            }}
          >
            Start this course
          </button>
        )}
      </div>

      {error && <ErrorNotice message={error} />}

      <div className="mt-7 space-y-5">
        {course.modules.map((module) => (
          <article key={module.id} className="rounded-3xl border p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
              Module {module.position}
            </p>
            <h3 className="mt-1 font-display text-xl">{module.title}</h3>
            {module.description && <p className="mt-1 text-sm opacity-60">{module.description}</p>}
            <div className="mt-4 divide-y">
              {module.lessons.map((lesson, index) => {
                const number = lessons.findIndex((item) => item.id === lesson.id) + 1;
                return (
                  <button
                    type="button"
                    key={lesson.id}
                    disabled={busy}
                    onClick={() => void onOpenLesson(lesson)}
                    className="flex w-full items-start gap-3 py-4 text-left disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                      {lesson.status === "completed" ? "✓" : number || index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{lesson.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed opacity-60">{lesson.summary}</span>
                      <span className="mt-1 block text-[11px] capitalize opacity-45">
                        {lesson.estimatedMinutes} min · {lesson.status.replace("_", " ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LessonReader({
  view,
  busy,
  error,
  onBack,
  onStatusChange,
  onNavigate,
}: {
  view: LessonView;
  busy: boolean;
  error: string;
  onBack: () => void;
  onStatusChange: (status: "in_progress" | "completed") => Promise<void>;
  onNavigate: (id: string) => Promise<void>;
}) {
  const completed = view.lesson.status === "completed";
  return (
    <article className="mx-auto max-w-3xl px-5 py-8">
      <button type="button" onClick={onBack} className="rounded-full border px-3 py-1.5 text-xs">
        Back to course
      </button>

      <header className="mt-6 border-b pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
          {view.course.title} · {view.module.title}
        </p>
        <h2 className="mt-2 font-display text-3xl leading-tight">{view.lesson.title}</h2>
        <p className="mt-3 text-sm leading-relaxed opacity-65">{view.lesson.summary}</p>
        <p className="mt-3 text-xs opacity-45">Estimated reading: {view.lesson.estimatedMinutes} minutes</p>
      </header>

      {error && <ErrorNotice message={error} />}

      <div className="prose prose-sm mt-7 max-w-none dark:prose-invert prose-headings:font-display prose-a:break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{view.lesson.contentMarkdown}</ReactMarkdown>
      </div>

      <section className="mt-8 rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Lesson references</h3>
        <ul className="mt-3 space-y-2 text-xs opacity-70">
          {view.lesson.sources.map((source, index) => (
            <li key={`${source.label}-${index}`}>
              {source.label}{source.locator && source.locator !== source.label ? ` — ${source.locator}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStatusChange(completed ? "in_progress" : "completed")}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{
            background: "var(--tg-theme-button-color, var(--pine))",
            color: "var(--tg-theme-button-text-color, var(--parchment-soft))",
          }}
        >
          {completed ? "Mark for review" : "Complete lesson"}
        </button>
        <a href="/telegram/library" className="rounded-xl border px-4 py-2.5 text-sm">
          Open study notes
        </a>
      </div>

      <nav className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Lesson navigation">
        {view.previousLesson ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onNavigate(view.previousLesson!.id)}
            className="rounded-2xl border p-4 text-left disabled:opacity-40"
          >
            <span className="block text-[10px] uppercase tracking-wide opacity-45">Previous</span>
            <span className="mt-1 block text-sm font-semibold">{view.previousLesson.title}</span>
          </button>
        ) : <span />}
        {view.nextLesson && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onNavigate(view.nextLesson!.id)}
            className="rounded-2xl border p-4 text-left disabled:opacity-40"
          >
            <span className="block text-[10px] uppercase tracking-wide opacity-45">Next</span>
            <span className="mt-1 block text-sm font-semibold">{view.nextLesson.title}</span>
          </button>
        )}
      </nav>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="font-display text-2xl">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-45">{label}</p>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full border" aria-label={`${percent}% complete`}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(Math.max(percent, 0), 100)}%`,
          background: "var(--tg-theme-button-color, var(--pine))",
        }}
      />
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="mt-5 rounded-xl border border-[#8a1f1f]/20 bg-[#fbf1f1] px-3 py-2 text-xs text-[#7a1f1f]">
      {message}
    </p>
  );
}

function LoadingCards() {
  return (
    <section className="mx-auto max-w-3xl space-y-4 px-5 py-10" aria-label="Loading learning paths">
      <div className="h-36 animate-pulse rounded-3xl border opacity-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-3xl border opacity-40" />
        <div className="h-48 animate-pulse rounded-3xl border opacity-40" />
      </div>
    </section>
  );
}
