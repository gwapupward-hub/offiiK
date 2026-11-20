import type {
  TelegramChatFull,
  TelegramChatMember,
  TelegramUserRef,
} from "@/lib/community/types";

const TELEGRAM_API = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 10_000;

export type TelegramErrorKind = "api" | "network" | "timeout" | "invalid_response";

/**
 * A failed Bot API call. `outcomeUnknown` is true when the request may have
 * reached Telegram (timeout or dropped connection), so a send must not be
 * blindly retried.
 */
export class TelegramApiError extends Error {
  readonly method: string;
  readonly kind: TelegramErrorKind;
  readonly errorCode?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    method: string,
    kind: TelegramErrorKind,
    message: string,
    options: { errorCode?: number; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "TelegramApiError";
    this.method = method;
    this.kind = kind;
    this.errorCode = options.errorCode;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get retryable(): boolean {
    if (this.kind === "network" || this.kind === "timeout") return true;
    return this.errorCode === 429 || (this.errorCode !== undefined && this.errorCode >= 500);
  }

  get outcomeUnknown(): boolean {
    return this.kind === "network" || this.kind === "timeout";
  }

  /** Stable, content-free code for logs and the inbox `last_error_code`. */
  get code(): string {
    if (this.kind === "api") return `telegram_${this.errorCode ?? "error"}`;
    return `telegram_${this.kind}`;
  }
}

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; web_app: { url: string } };

export type SendMessageParams = {
  chat_id: number;
  text: string;
  parse_mode?: "HTML";
  message_thread_id?: number;
  reply_parameters?: { message_id: number; allow_sending_without_reply?: boolean };
  reply_markup?: { inline_keyboard: InlineKeyboardButton[][] };
  link_preview_options?: { is_disabled: boolean };
  disable_notification?: boolean;
};

export type BotIdentity = TelegramUserRef & {
  is_bot: true;
  username: string;
  can_read_all_group_messages?: boolean;
};

export type TelegramClient = {
  getMe(): Promise<BotIdentity>;
  getChat(chatId: number): Promise<TelegramChatFull>;
  getChatMember(chatId: number, userId: number): Promise<TelegramChatMember>;
  sendMessage(params: SendMessageParams): Promise<{ message_id: number }>;
  /** Bot user id, derived from the token without a network call. */
  readonly botId: number;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function botIdFromToken(token: string): number {
  const id = Number(token.split(":")[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function createTelegramClient(
  token: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
): TelegramClient {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let identity: Promise<BotIdentity> | null = null;

  async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      // Never include the request URL: it contains the bot token.
      throw new TelegramApiError(
        method,
        timedOut ? "timeout" : "network",
        timedOut ? `Telegram ${method} timed out.` : `Telegram ${method} network failure.`
      );
    }

    let data: {
      ok?: boolean;
      result?: T;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    try {
      data = await response.json();
    } catch {
      throw new TelegramApiError(method, "invalid_response", `Telegram ${method} returned invalid JSON.`, {
        errorCode: response.status,
      });
    }

    if (!response.ok || !data.ok) {
      throw new TelegramApiError(
        method,
        "api",
        data.description ? `Telegram ${method}: ${data.description}` : `Telegram ${method} failed.`,
        {
          errorCode: data.error_code ?? response.status,
          retryAfterSeconds: data.parameters?.retry_after,
        }
      );
    }
    return data.result as T;
  }

  return {
    botId: botIdFromToken(token),
    getMe() {
      if (!identity) {
        identity = call<BotIdentity>("getMe", {}).catch((error) => {
          identity = null;
          throw error;
        });
      }
      return identity;
    },
    getChat(chatId) {
      return call<TelegramChatFull>("getChat", { chat_id: chatId });
    },
    getChatMember(chatId, userId) {
      return call<TelegramChatMember>("getChatMember", { chat_id: chatId, user_id: userId });
    },
    sendMessage(params) {
      return call<{ message_id: number }>("sendMessage", params);
    },
  };
}

let sharedClient: TelegramClient | null = null;
let sharedToken: string | undefined;
let testOverride: TelegramClient | null = null;

/** Returns the process-wide client, or null when TELEGRAM_BOT_TOKEN is absent. */
export function getTelegramClient(): TelegramClient | null {
  if (testOverride) return testOverride;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!sharedClient || sharedToken !== token) {
    sharedClient = createTelegramClient(token);
    sharedToken = token;
  }
  return sharedClient;
}

/** Test seam: replace the Telegram client used by community services. */
export function setTelegramClientForTesting(client: TelegramClient | null): void {
  testOverride = client;
}

/** The bot's username, preferring configuration over a network lookup. */
export async function resolveBotUsername(client: TelegramClient): Promise<string> {
  const configured = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (configured) return configured;
  return (await client.getMe()).username;
}
