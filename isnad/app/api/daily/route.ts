import { NextRequest, NextResponse } from "next/server";
import { dateForOffset, getDailyDashboard, setDailyProgress } from "@/lib/dailyStore";
import type { DailySection } from "@/lib/dailyTypes";
import { recordEvent } from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticate(request: NextRequest) {
  return resolveTelegramSession(request, { required: true, requireDatabase: true });
}

function offsetFrom(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.trunc(parsed), -840), 840);
}

function isSection(value: unknown): value is DailySection {
  return value === "quran" || value === "hadith" || value === "vocabulary";
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
    return NextResponse.json({ error: "Daily knowledge is unavailable." }, { status: 503 });
  }

  const offsetMinutes = offsetFrom(request.nextUrl.searchParams.get("offset"));
  const date = dateForOffset(offsetMinutes);
  const dashboard = await getDailyDashboard(session.userId, date);
  return NextResponse.json(
    { dashboard },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session || !session.ok) {
    return NextResponse.json(
      { error: session?.error ?? "Telegram authentication is required." },
      { status: session?.status ?? 401 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Daily knowledge is unavailable." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { section?: unknown; completed?: unknown; offsetMinutes?: unknown }
    | null;
  if (!body || !isSection(body.section) || typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "A valid daily section and completed state are required." },
      { status: 400 }
    );
  }

  const offsetMinutes = offsetFrom(body.offsetMinutes);
  const date = dateForOffset(offsetMinutes);
  const dashboard = await setDailyProgress({
    userId: session.userId,
    date,
    section: body.section,
    completed: body.completed,
  });

  await recordEvent("daily_knowledge_progress_updated", session.userId, {
    date,
    section: body.section,
    completed: body.completed,
    dayCompleted: dashboard.progress.completed,
    currentStreak: dashboard.streak.current,
  });

  return NextResponse.json(
    { dashboard },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
