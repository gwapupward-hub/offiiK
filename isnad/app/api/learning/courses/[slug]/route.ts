import { NextRequest, NextResponse } from "next/server";
import { enrollInCourse, getLearningCourse } from "@/lib/learningStore";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

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

  const { slug } = await context.params;
  const course = await getLearningCourse(session.userId, slug);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  return NextResponse.json({ course });
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const { slug } = await context.params;
  const course = await getLearningCourse(session.userId, slug);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const enrolled = await enrollInCourse(session.userId, course.id);
  if (!enrolled) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  await recordEvent("learning_course_enrolled", session.userId, {
    courseId: course.id,
    courseSlug: course.slug,
  });

  const updated = await getLearningCourse(session.userId, slug);
  return NextResponse.json({ course: updated }, { status: 201 });
}
