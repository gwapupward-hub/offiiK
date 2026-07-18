import crypto from "crypto";

/**
 * Validates the `initData` string a Telegram Mini App sends to the backend,
 * following Telegram's documented HMAC-SHA256 scheme:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The Mini App hands the raw, signed `initData` query string to the client
 * (`WebApp.initData`); the client forwards it to us verbatim in a header. We
 * re-derive the hash from the bot token and compare — this is how the server
 * proves a request really came from Telegram and hasn't been tampered with.
 */

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type TelegramValidationResult = {
  valid: boolean;
  user?: TelegramUser;
};

// Reject initData older than this. Telegram sets `auth_date` when the Mini App
// is opened; a stale value likely means a replayed/leaked string.
const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS
): TelegramValidationResult {
  if (!initData || !botToken) return { valid: false };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false };

  // data-check-string: every field except `hash`, as `key=value`, sorted
  // alphabetically by key and joined with newlines.
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  // secretKey = HMAC-SHA256(key="WebAppData", message=botToken)
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // computed hash = HMAC-SHA256(key=secretKey, message=dataCheckString)
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Constant-time comparison to avoid leaking timing information.
  const computedBuf = Buffer.from(computedHash, "hex");
  const providedBuf = Buffer.from(hash, "hex");
  if (
    computedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(computedBuf, providedBuf)
  ) {
    return { valid: false };
  }

  // Reject stale data based on auth_date (unix seconds).
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { valid: false };
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSeconds) return { valid: false };

  // Parse the optional `user` field (JSON-encoded).
  let user: TelegramUser | undefined;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw) as TelegramUser;
      if (parsed && typeof parsed.id === "number") {
        user = {
          id: parsed.id,
          first_name: parsed.first_name,
          last_name: parsed.last_name,
          username: parsed.username,
          language_code: parsed.language_code,
          photo_url: parsed.photo_url,
        };
      }
    } catch {
      // A present-but-unparseable user field doesn't invalidate the signature;
      // the request is authentic, we just can't surface the user object.
    }
  }

  return { valid: true, user };
}
