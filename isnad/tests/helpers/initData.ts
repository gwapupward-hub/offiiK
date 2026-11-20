import crypto from "node:crypto";

/** Builds Telegram Mini App initData signed exactly as Telegram does. */
export function signInitData(
  botToken: string,
  fields: { user?: Record<string, unknown>; authDate?: number; startParam?: string; extra?: Record<string, string> } = {}
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(fields.authDate ?? Math.floor(Date.now() / 1000)));
  params.set("query_id", "AAHtest");
  if (fields.user) params.set("user", JSON.stringify(fields.user));
  if (fields.startParam) params.set("start_param", fields.startParam);
  for (const [key, value] of Object.entries(fields.extra ?? {})) params.set(key, value);

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
