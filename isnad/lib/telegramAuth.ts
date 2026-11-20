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

export type TelegramValidationFailure =
  | "missing_input"
  | "missing_hash"
  | "bad_signature"
  | "missing_auth_date"
  | "expired"
  | "future_dated";

export type TelegramValidationResult = {
  valid: boolean;
  user?: TelegramUser;
  /** Signed `start_param` from a t.me/<bot>/<app>?startapp=… link, when present. */
  startParam?: string;
  authDate?: number;
  reason?: TelegramValidationFailure;
};

// Reject initData older than this. Telegram sets `auth_date` when the Mini App
// is opened; a stale value likely means a replayed/leaked string.
const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
// Tolerated clock skew for auth_date values slightly ahead of the server clock.
const MAX_FUTURE_SKEW_SECONDS = 60;

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS
): TelegramValidationResult {
  if (!initData || !botToken) return { valid: false, reason: "missing_input" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false, reason: "missing_hash" };

  // For bot-token HMAC validation, Telegram signs every received field except
  // `hash`. Modern clients may include an Ed25519 `signature` field; it must
  // remain in this data-check-string or the HMAC comparison will fail.
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
    return { valid: false, reason: "bad_signature" };
  }

  // Reject stale and future-dated data based on auth_date (unix seconds).
  const authDateRaw = params.get("auth_date");
  const authDate = Number(authDateRaw);
  if (!authDateRaw || !Number.isSafeInteger(authDate) || authDate <= 0) {
    return { valid: false, reason: "missing_auth_date" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate - nowSeconds > MAX_FUTURE_SKEW_SECONDS) return { valid: false, reason: "future_dated" };
  if (nowSeconds - authDate > maxAgeSeconds) return { valid: false, reason: "expired" };

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

  const startParam = params.get("start_param") ?? undefined;
  return { valid: true, user, startParam, authDate };
}
