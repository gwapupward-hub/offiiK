import { getDatabase } from "@/lib/db";
import type {
  LearningCourse,
  LearningCourseSummary,
  LearningDashboard,
  LearningLesson,
  LearningLessonSummary,
  LearningModule,
  LearningSourceRef,
  LessonStatus,
} from "@/lib/learningTypes";

function optionalIso(value: unknown): string | undefined {
  return value ? new Date(value as string | Date).toISOString() : undefined;
}

function mapSourceRefs(value: unknown): LearningSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      label: String(item.label ?? "Reference"),
      type: String(item.type ?? "reference"),
      locator: item.locator ? String(item.locator) : undefined,
    }));
}

function mapCourseSummary(row: Record<string, unknown>): LearningCourseSummary {
  const totalLessons = Number(row.total_lessons ?? 0);
  const completedLessons = Number(row.completed_lessons ?? 0);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    subject: String(row.subject),
    level: row.level as LearningCourseSummary["level"],
    estimatedMinutes: Number(row.estimated_minutes ?? 0),
    position: Number(row.position ?? 0),
    enrolled: Boolean(row.started_at),
    startedAt: optionalIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    totalLessons,
    completedLessons,
    progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    nextLessonId: row.next_lesson_id ? String(row.next_lesson_id) : undefined,
    nextLessonTitle: row.next_lesson_title ? String(row.next_lesson_title) : undefined,
  };
}

const COURSE_SUMMARY_SQL = `
  SELECT
    c.id::text AS id,
    c.slug,
    c.title,
    c.description,
    c.subject,
    c.level,
    c.estimated_minutes,
    c.position,
    e.started_at,
    e.last_opened_at,
    e.completed_at,
    COUNT(l.id)::int AS total_lessons,
    COUNT(l.id) FILTER (WHERE p.status = 'completed')::int AS completed_lessons,
    next_lesson.id::text AS next_lesson_id,
    next_lesson.title AS next_lesson_title
  FROM learning_courses c
  LEFT JOIN course_enrollments e
    ON e.course_id = c.id AND e.user_id = $1
  LEFT JOIN learning_modules m ON m.course_id = c.id
  LEFT JOIN learning_lessons l ON l.module_id = m.id AND l.published = true
  LEFT JOIN lesson_progress p
    ON p.lesson_id = l.id AND p.user_id = $1
  LEFT JOIN LATERAL (
    SELECT l2.id, l2.title
    FROM learning_modules m2
    JOIN learning_lessons l2 ON l2.module_id = m2.id AND l2.published = true
    LEFT JOIN lesson_progress p2
      ON p2.lesson_id = l2.id AND p2.user_id = $1
    WHERE m2.course_id = c.id
      AND COALESCE(p2.status, 'not_started') <> 'completed'
    ORDER BY m2.position, l2.position
    LIMIT 1
  ) next_lesson ON true
  WHERE c.published = true
`;

export async function listLearningDashboard(userId: string): Promise<LearningDashboard> {
  const sql = getDatabase();
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `${COURSE_SUMMARY_SQL}
     GROUP BY c.id, e.started_at, e.last_opened_at, e.completed_at,
              next_lesson.id, next_lesson.title
     ORDER BY c.position, c.title`,
    [userId]
  );
  const courses = rows.map(mapCourseSummary);
  const activeRows = rows
    .filter((row) => row.started_at && !row.completed_at)
    .sort(
      (a, b) =>
        new Date(b.last_opened_at as string | Date).getTime() -
        new Date(a.last_opened_at as string | Date).getTime()
    );
  const activeCourse = activeRows[0]
    ? courses.find((course) => course.id === String(activeRows[0].id))
    : undefined;

  return {
    courses,
    enrolledCourses: courses.filter((course) => course.enrolled).length,
    completedCourses: courses.filter((course) => Boolean(course.completedAt)).length,
    completedLessons: courses.reduce((total, course) => total + course.completedLessons, 0),
    totalLessons: courses.reduce((total, course) => total + course.totalLessons, 0),
    activeCourse,
  };
}

async function getCourseSummaryBySlug(
  userId: string,
  slug: string
): Promise<LearningCourseSummary | null> {
  const sql = getDatabase();
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `${COURSE_SUMMARY_SQL}
     AND c.slug = $2
     GROUP BY c.id, e.started_at, e.last_opened_at, e.completed_at,
              next_lesson.id, next_lesson.title
     LIMIT 1`,
    [userId, slug]
  );
  return rows[0] ? mapCourseSummary(rows[0]) : null;
}

export async function getLearningCourse(
  userId: string,
  slug: string
): Promise<LearningCourse | null> {
  const course = await getCourseSummaryBySlug(userId, slug);
  if (!course) return null;

  const sql = getDatabase();
  const moduleRows = await sql<Array<Record<string, unknown>>>`
    SELECT id::text AS id, slug, title, description, position
    FROM learning_modules
    WHERE course_id = ${course.id}
    ORDER BY position, title
  `;
  const lessonRows = await sql<Array<Record<string, unknown>>>`
    SELECT
      l.id::text AS id,
      l.module_id::text AS module_id,
      l.slug,
      l.title,
      l.summary,
      l.estimated_minutes,
      l.position,
      p.status,
      p.started_at,
      p.completed_at
    FROM learning_lessons l
    JOIN learning_modules m ON m.id = l.module_id
    LEFT JOIN lesson_progress p
      ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE m.course_id = ${course.id} AND l.published = true
    ORDER BY m.position, l.position
  `;

  const lessonsByModule = new Map<string, LearningLessonSummary[]>();
  for (const row of lessonRows) {
    const moduleId = String(row.module_id);
    const lessons = lessonsByModule.get(moduleId) ?? [];
    lessons.push({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      summary: String(row.summary ?? ""),
      estimatedMinutes: Number(row.estimated_minutes ?? 5),
      position: Number(row.position ?? 0),
      status: (row.status ?? "not_started") as LessonStatus,
      startedAt: optionalIso(row.started_at),
      completedAt: optionalIso(row.completed_at),
    });
    lessonsByModule.set(moduleId, lessons);
  }

  const modules: LearningModule[] = moduleRows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description ?? ""),
    position: Number(row.position ?? 0),
    lessons: lessonsByModule.get(String(row.id)) ?? [],
  }));

  return { ...course, modules };
}

export type LearningLessonView = {
  lesson: LearningLesson;
  course: { id: string; slug: string; title: string };
  module: { id: string; title: string };
  previousLesson?: { id: string; title: string };
  nextLesson?: { id: string; title: string };
};

export async function getLearningLesson(
  userId: string,
  lessonId: string
): Promise<LearningLessonView | null> {
  const sql = getDatabase();
  const [row] = await sql<Array<Record<string, unknown>>>`
    SELECT
      l.id::text AS id,
      l.slug,
      l.title,
      l.summary,
      l.content_markdown,
      l.source_refs,
      l.estimated_minutes,
      l.position,
      m.id::text AS module_id,
      m.title AS module_title,
      c.id::text AS course_id,
      c.slug AS course_slug,
      c.title AS course_title,
      p.status,
      p.started_at,
      p.completed_at
    FROM learning_lessons l
    JOIN learning_modules m ON m.id = l.module_id
    JOIN learning_courses c ON c.id = m.course_id
    LEFT JOIN lesson_progress p
      ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE l.id = ${lessonId} AND l.published = true AND c.published = true
  `;
  if (!row) return null;

  const ordered = await sql<Array<Record<string, unknown>>>`
    SELECT l.id::text AS id, l.title
    FROM learning_lessons l
    JOIN learning_modules m ON m.id = l.module_id
    WHERE m.course_id = ${String(row.course_id)} AND l.published = true
    ORDER BY m.position, l.position
  `;
  const index = ordered.findIndex((item) => String(item.id) === lessonId);

  return {
    lesson: {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      summary: String(row.summary ?? ""),
      contentMarkdown: String(row.content_markdown),
      sources: mapSourceRefs(row.source_refs),
      estimatedMinutes: Number(row.estimated_minutes ?? 5),
      position: Number(row.position ?? 0),
      status: (row.status ?? "not_started") as LessonStatus,
      startedAt: optionalIso(row.started_at),
      completedAt: optionalIso(row.completed_at),
    },
    course: {
      id: String(row.course_id),
      slug: String(row.course_slug),
      title: String(row.course_title),
    },
    module: {
      id: String(row.module_id),
      title: String(row.module_title),
    },
    previousLesson:
      index > 0
        ? { id: String(ordered[index - 1].id), title: String(ordered[index - 1].title) }
        : undefined,
    nextLesson:
      index >= 0 && index < ordered.length - 1
        ? { id: String(ordered[index + 1].id), title: String(ordered[index + 1].title) }
        : undefined,
  };
}

export async function enrollInCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  const sql = getDatabase();
  const rows = await sql`
    INSERT INTO course_enrollments (user_id, course_id)
    SELECT ${userId}, id
    FROM learning_courses
    WHERE id = ${courseId} AND published = true
    ON CONFLICT (user_id, course_id) DO UPDATE SET last_opened_at = now()
    RETURNING course_id
  `;
  return rows.length > 0;
}

export async function setLessonProgress(
  userId: string,
  lessonId: string,
  status: "in_progress" | "completed"
): Promise<LearningLessonView | null> {
  const sql = getDatabase();
  const changed = await sql.begin(async (transaction) => {
    const [lesson] = await transaction<Array<Record<string, unknown>>>`
      SELECT l.id::text AS id, c.id::text AS course_id
      FROM learning_lessons l
      JOIN learning_modules m ON m.id = l.module_id
      JOIN learning_courses c ON c.id = m.course_id
      WHERE l.id = ${lessonId} AND l.published = true AND c.published = true
      FOR UPDATE
    `;
    if (!lesson) return false;

    await transaction`
      INSERT INTO course_enrollments (user_id, course_id, last_opened_at)
      VALUES (${userId}, ${String(lesson.course_id)}, now())
      ON CONFLICT (user_id, course_id) DO UPDATE SET last_opened_at = now()
    `;

    await transaction`
      INSERT INTO lesson_progress (
        user_id, lesson_id, status, started_at, completed_at, updated_at
      ) VALUES (
        ${userId}, ${lessonId}, ${status}, now(),
        ${status === "completed" ? transaction`now()` : null}, now()
      )
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = EXCLUDED.completed_at,
        updated_at = now()
    `;

    const [counts] = await transaction<Array<Record<string, unknown>>>`
      SELECT
        COUNT(l.id)::int AS total_lessons,
        COUNT(l.id) FILTER (WHERE p.status = 'completed')::int AS completed_lessons
      FROM learning_modules m
      JOIN learning_lessons l ON l.module_id = m.id AND l.published = true
      LEFT JOIN lesson_progress p
        ON p.lesson_id = l.id AND p.user_id = ${userId}
      WHERE m.course_id = ${String(lesson.course_id)}
    `;
    const complete =
      Number(counts?.total_lessons ?? 0) > 0 &&
      Number(counts?.total_lessons ?? 0) === Number(counts?.completed_lessons ?? 0);

    await transaction`
      UPDATE course_enrollments
      SET completed_at = ${complete ? transaction`COALESCE(completed_at, now())` : null},
          last_opened_at = now()
      WHERE user_id = ${userId} AND course_id = ${String(lesson.course_id)}
    `;
    return true;
  });

  return changed ? getLearningLesson(userId, lessonId) : null;
}
