import { NextRequest, NextResponse } from "next/server";
import { getLearningLesson, setLessonProgress } from "@/lib/learningStore";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await authenticate(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Guided learning is unavailable." }, { status: 503 });
  }

  const { id } = await context.params;
  const lesson = await getLearningLesson(session.userId, id);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  return NextResponse.json({ lesson });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await authenticate(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Guided learning is unavailable." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (!body || (body.status !== "in_progress" && body.status !== "completed")) {
    return NextResponse.json(
      { error: "Lesson status must be in_progress or completed." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const lesson = await setLessonProgress(session.userId, id, body.status);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  await recordEvent(
    body.status === "completed" ? "learning_lesson_completed" : "learning_lesson_started",
    session.userId,
    {
      lessonId: id,
      courseId: lesson.course.id,
      courseSlug: lesson.course.slug,
    }
  );
  return NextResponse.json({ lesson });
}
