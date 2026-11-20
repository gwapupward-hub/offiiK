import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runCommunityMaintenance } from "@/lib/community/maintenance";
import { inboxHealth } from "@/lib/community/telegramInbox";
import { drainInbox } from "@/lib/community/updateProcessor";
import { secretMatches } from "@/lib/community/webhookIngress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Operator/cron endpoint: retries due inbox updates, closes expired leases,
 * applies retention, and reports inbox health. Requires
 * `Authorization: Bearer $CRON_SECRET` and fails closed without it.
 * Not scheduled by this change; see docs/community/c0-foundation.md.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const processed = await drainInbox(10);
  const retention = await runCommunityMaintenance();
  const health = await inboxHealth();
  if (health.terminal_failed > 0 || (health.oldestPendingSeconds ?? 0) > 600) {
    logger.warn("telegram_inbox_attention", { ...health });
  }
  return NextResponse.json({ processed, retention, health }, { headers: { "Cache-Control": "no-store" } });
}
