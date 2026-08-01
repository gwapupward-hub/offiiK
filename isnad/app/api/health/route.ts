import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabase();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_WEBHOOK_SECRET &&
      process.env.TELEGRAM_MINI_APP_URL &&
      process.env.PUBLIC_BASE_URL
  );

  const ready =
    openaiConfigured &&
    telegramConfigured &&
    database.configured &&
    database.reachable &&
    database.schemaReady;

  const operational =
    openaiConfigured && (!database.configured || database.reachable);

  return NextResponse.json(
    {
      status: ready ? "healthy" : operational ? "degraded" : "unhealthy",
      ready,
      timestamp: new Date().toISOString(),
      services: {
        openai: { configured: openaiConfigured },
        telegram: { configured: telegramConfigured },
        database,
      },
    },
    { status: operational ? 200 : 503 }
  );
}
