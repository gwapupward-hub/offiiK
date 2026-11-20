import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isProductionRuntime } from "@/lib/community/featureFlags";
import {
  shouldRetainPayload,
  updateChatId,
  updateKind,
  type TelegramUpdate,
} from "@/lib/community/telegramDispatcher";
import { persistUpdate } from "@/lib/community/telegramInbox";
import {
  communityRuntimeEnabled,
  drainInbox,
  processInboxUpdate,
  processWithoutInbox,
} from "@/lib/community/updateProcessor";

const MAX_BODY_BYTES = 1_000_000;

export type IngressResult = {
  response: NextResponse;
  /** Work to run after the response is sent (Next.js `after`). */
  followUp?: () => Promise<void>;
};

export function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  // Hash first so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Authenticates a webhook request, durably records the update, and only then
 * acknowledges it. Processing (including any AI completion) happens after the
 * response so Telegram never waits on, or retries because of, a slow answer.
 */
export async function ingestTelegramWebhook(
  request: Request,
  env: Record<string, string | undefined> = process.env
): Promise<IngressResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.error("telegram_token_missing");
    return { response: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    if (isProductionRuntime(env)) {
      // Fail closed: without a secret anyone could drive the bot.
      logger.error("telegram_webhook_secret_missing");
      return { response: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
    }
    logger.warn("telegram_webhook_unauthenticated_dev_mode");
  } else if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 401 }) };
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return { response: NextResponse.json({ ok: true, ignored: "too_large" }) };
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return { response: NextResponse.json({ ok: true, ignored: "invalid_json" }) };
  }
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) {
    return { response: NextResponse.json({ ok: true, ignored: "invalid_update" }) };
  }

  if (!databaseConfigured()) {
    // Local development without PostgreSQL: no durability or deduplication.
    return {
      response: NextResponse.json({ ok: true }),
      followUp: () => processWithoutInbox(update, token),
    };
  }

  const retainPayload = shouldRetainPayload(update, { communityEnabled: communityRuntimeEnabled() });
  let persisted;
  try {
    persisted = await persistUpdate({
      updateId: update.update_id,
      kind: updateKind(update),
      chatId: updateChatId(update),
      payload: update,
      retainPayload,
    });
  } catch (error) {
    // Do not acknowledge an update we could not store: Telegram will redeliver.
    logger.error("telegram_inbox_persist_failed", {
      updateId: update.update_id,
      errorCode: (error as { code?: string })?.code ?? "unknown",
    });
    return { response: NextResponse.json({ error: "storage_unavailable" }, { status: 503 }) };
  }

  if (persisted === "duplicate") {
    return { response: NextResponse.json({ ok: true, duplicate: true }) };
  }
  if (!retainPayload) {
    return { response: NextResponse.json({ ok: true }) };
  }

  return {
    response: NextResponse.json({ ok: true }),
    followUp: async () => {
      try {
        await processInboxUpdate(update.update_id);
        await drainInbox(3);
      } catch (error) {
        logger.error("telegram_inbox_followup_failed", {
          updateId: update.update_id,
          errorCode: (error as { code?: string })?.code ?? "unknown",
        });
      }
    },
  };
}
