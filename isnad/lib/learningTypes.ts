export type LearningLevel = "beginner" | "intermediate" | "advanced";
export type LessonStatus = "not_started" | "in_progress" | "completed";

export type LearningSourceRef = {
  label: string;
  type: string;
  locator?: string;
};

export type LearningLessonSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  position: number;
  status: LessonStatus;
  startedAt?: string;
  completedAt?: string;
};

export type LearningLesson = LearningLessonSummary & {
  contentMarkdown: string;
  sources: LearningSourceRef[];
};

export type LearningModule = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  lessons: LearningLessonSummary[];
};

export type LearningCourseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  subject: string;
  level: LearningLevel;
  estimatedMinutes: number;
  position: number;
  enrolled: boolean;
  startedAt?: string;
  completedAt?: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  nextLessonId?: string;
  nextLessonTitle?: string;
};

export type LearningCourse = LearningCourseSummary & {
  modules: LearningModule[];
};

export type LearningDashboard = {
  courses: LearningCourseSummary[];
  enrolledCourses: number;
  completedCourses: number;
  completedLessons: number;
  totalLessons: number;
  activeCourse?: LearningCourseSummary;
};
