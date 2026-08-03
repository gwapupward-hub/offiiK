import { NextRequest, NextResponse } from "next/server";
import { enrollInCourse, listLearningDashboard } from "@/lib/learningStore";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

async function authenticate(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

export async function GET(request: NextRequest) {
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

  const dashboard = await listLearningDashboard(session.userId);
  return NextResponse.json({ dashboard });
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as { courseId?: unknown } | null;
  if (!body || typeof body.courseId !== "string" || !body.courseId.trim()) {
    return NextResponse.json({ error: "A valid course is required." }, { status: 400 });
  }

  const enrolled = await enrollInCourse(session.userId, body.courseId);
  if (!enrolled) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  await recordEvent("learning_course_enrolled", session.userId, {
    courseId: body.courseId,
  });
  const dashboard = await listLearningDashboard(session.userId);
  return NextResponse.json({ enrolled: true, dashboard }, { status: 201 });
}
