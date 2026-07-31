import { after, NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  handleTelegramUpdate,
  sendMessage,
  type TelegramUpdate,
} from "@/lib/telegramBot";
import { reserveTelegramUpdate } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.error("telegram_token_missing");
    return NextResponse.json({ ok: true });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!Number.isSafeInteger(update.update_id)) {
    return NextResponse.json({ ok: true });
  }

  const reserved = await reserveTelegramUpdate(update.update_id);
  if (!reserved) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  after(async () => {
    try {
      await handleTelegramUpdate(token, update);
    } catch (error) {
      logger.error("telegram_update_failed", {
        updateId: update.update_id,
        error: error instanceof Error ? error.message : "Unknown Telegram error",
      });
      const chatId = (update.message ?? update.edited_message)?.chat?.id;
      if (typeof chatId === "number") {
        await sendMessage(
          token,
          chatId,
          "Something went wrong answering that. Please try again in a moment."
        ).catch(() => undefined);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
