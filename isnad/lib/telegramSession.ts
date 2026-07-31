import type { NextRequest } from "next/server";
import type { UserSettings } from "@/lib/appTypes";
import { databaseConfigured } from "@/lib/db";
import { getSettings, upsertTelegramIdentity } from "@/lib/store";
import { validateTelegramInitData } from "@/lib/telegramAuth";

type TelegramUser = NonNullable<ReturnType<typeof validateTelegramInitData>["user"]>;

export type TelegramSessionResult =
  | {
      ok: true;
      user: TelegramUser;
      userId: string | null;
      settings: UserSettings;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function resolveTelegramSession(
  request: NextRequest,
  options: { required?: boolean; requireDatabase?: boolean } = {}
): Promise<TelegramSessionResult | null> {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    if (options.required) {
      return { ok: false, status: 401, error: "Telegram authentication is required." };
    }
    return null;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return {
      ok: false,
      status: 500,
      error: "Server is missing TELEGRAM_BOT_TOKEN.",
    };
  }

  const validation = validateTelegramInitData(initData, botToken);
  if (!validation.valid || !validation.user) {
    return { ok: false, status: 401, error: "Telegram authentication failed." };
  }

  if (options.requireDatabase && !databaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Persistent accounts are unavailable until DATABASE_URL is configured.",
    };
  }

  const userId = await upsertTelegramIdentity({
    id: validation.user.id,
    first_name:
      validation.user.first_name?.trim() || validation.user.username?.trim() || "Telegram user",
    last_name: validation.user.last_name,
    username: validation.user.username,
    language_code: validation.user.language_code,
  });
  const settings = await getSettings(userId);
  return { ok: true, user: validation.user, userId, settings };
}
