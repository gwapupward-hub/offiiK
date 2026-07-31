import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabase();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET
  );
  const healthy = openaiConfigured && (!database.configured || database.reachable);

  return NextResponse.json(
    {
      status: healthy ? (database.configured ? "healthy" : "degraded") : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        openai: { configured: openaiConfigured },
        telegram: { configured: telegramConfigured },
        database,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
