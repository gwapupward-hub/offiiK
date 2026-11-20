import { randomUUID } from "node:crypto";
import { databaseConfigured } from "@/lib/db";
import { logger } from "@/lib/logger";
import { executeCommunityRoute } from "@/lib/community/communityCommands";
import { executeGroupAssistantRoute } from "@/lib/community/communityAssistant";
import { communityFeaturesEnabled, MODULE_RUNTIME_RELEASED } from "@/lib/community/featureFlags";
import {
  getTelegramClient,
  resolveBotUsername,
  TelegramApiError,
  type TelegramClient,
} from "@/lib/community/telegramApi";
import {
  classifyUpdate,
  needsBotUsername,
  type Route,
  type TelegramUpdate,
} from "@/lib/community/telegramDispatcher";
import {
  claimUpdate,
  collectReadyUpdates,
  markFailed,
  markSideEffectStarted,
  markSucceeded,
  releaseSideEffect,
  type InboxStatus,
} from "@/lib/community/telegramInbox";
import { handleTelegramUpdate, sendMessage, type TelegramUpdate as PrivateUpdate } from "@/lib/telegramBot";
import type { ChatMessage } from "@/lib/providers";

const PRIVATE_FAILURE_TEXT = "Something went wrong answering that. Please try again in a moment.";

export function communityRuntimeEnabled(): boolean {
  return communityFeaturesEnabled() && databaseConfigured();
}

export type ExecuteHooks = {
  correlationId: string;
  markSideEffect: () => Promise<void>;
  releaseSideEffect?: () => Promise<void>;
};

export type ExecuteDeps = {
  token: string;
  client: TelegramClient;
  handlePrivate?: (token: string, update: TelegramUpdate) => Promise<void>;
  /** Test-only injection seam to exercise ingress -> inbox -> group AI without an external model. */
  generateGroup?: (prompt: string, messages: ChatMessage[]) => Promise<string>;
};

/** Classifies and runs one update. Throws on failure so the caller can record it. */
export async function executeUpdate(update: TelegramUpdate, deps: ExecuteDeps, hooks: ExecuteHooks): Promise<Route> {
  const username = needsBotUsername(update) ? await resolveBotUsername(deps.client) : null;
  const route = classifyUpdate(
    update,
    { id: deps.client.botId, username },
    { communityEnabled: communityRuntimeEnabled(), assistantReleased: MODULE_RUNTIME_RELEASED.assistant }
  );

  if (route.kind === "private") {
    // The private workflow streams an AI answer; it is never retried once started.
    await hooks.markSideEffect();
    const handlePrivate =
      deps.handlePrivate ?? ((token, value) => handleTelegramUpdate(token, value as unknown as PrivateUpdate));
    await handlePrivate(deps.token, update);
    return route;
  }

  if (route.kind === "group_assistant") {
    await executeGroupAssistantRoute(route, { client: deps.client, generate: deps.generateGroup }, {
      markSideEffect: hooks.markSideEffect,
      releaseSideEffect: hooks.releaseSideEffect,
    });
    return route;
  }

  if (route.kind !== "ignore") {
    await executeCommunityRoute(route, {
      client: deps.client,
      correlationId: hooks.correlationId,
      markSideEffect: hooks.markSideEffect,
      releaseSideEffect: hooks.releaseSideEffect,
    });
  }
  return route;
}

function failureFrom(error: unknown): { code: string; retryable: boolean; retryAfterSeconds?: number } {
  if (error instanceof TelegramApiError) {
    return { code: error.code, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds };
  }
  const code = (error as { code?: unknown })?.code;
  // PostgreSQL connection-class errors (08xxx) and pool timeouts are transient.
  if (typeof code === "string" && (code.startsWith("08") || code === "CONNECT_TIMEOUT" || code === "57P01")) {
    return { code: `db_${code}`, retryable: true };
  }
  return { code: "handler_error", retryable: false };
}

function privateChatId(update: TelegramUpdate): number | null {
  const message = update.message ?? update.edited_message;
  return message?.chat?.type === "private" && typeof message.chat.id === "number" ? message.chat.id : null;
}

/** Claims an inbox row, executes it, and records the outcome. */
export async function processInboxUpdate(
  updateId: number,
  deps?: Partial<ExecuteDeps>
): Promise<InboxStatus | "skipped"> {
  const token = deps?.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const client = deps?.client ?? getTelegramClient();
  if (!token || !client) return "skipped";

  const claimed = await claimUpdate(updateId);
  if (!claimed) return "skipped";
  const update = claimed.payload as TelegramUpdate;
  const correlationId = randomUUID();

  try {
    const route = await executeUpdate(update, { token, client, handlePrivate: deps?.handlePrivate, generateGroup: deps?.generateGroup }, {
      correlationId,
      markSideEffect: () => markSideEffectStarted(updateId),
      releaseSideEffect: () => releaseSideEffect(updateId),
    });
    await markSucceeded(updateId);
    logger.info("telegram_update_processed", { updateId, route: route.kind, correlationId });
    return "succeeded";
  } catch (error) {
    const failure = failureFrom(error);
    const status = await markFailed(updateId, failure);
    logger.error("telegram_update_failed", {
      updateId,
      correlationId,
      errorCode: failure.code,
      status,
      attempt: claimed.attempts,
    });
    const chatId = privateChatId(update);
    if (status === "terminal_failed" && chatId !== null) {
      await sendMessage(token, chatId, PRIVATE_FAILURE_TEXT).catch(() => undefined);
    }
    return status;
  }
}

/** Retries due updates and closes expired leases. Safe to call concurrently. */
export async function drainInbox(limit = 5, deps?: Partial<ExecuteDeps>): Promise<Record<string, number>> {
  const ids = await collectReadyUpdates(limit);
  const outcomes: Record<string, number> = {};
  for (const id of ids) {
    const outcome = await processInboxUpdate(id, deps);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return outcomes;
}

/** Non-durable path used only when no database is configured (local development). */
export async function processWithoutInbox(update: TelegramUpdate, token: string): Promise<void> {
  const client = getTelegramClient();
  if (!client) return;
  try {
    await executeUpdate(update, { token, client }, { correlationId: randomUUID(), markSideEffect: async () => {} });
  } catch (error) {
    logger.error("telegram_update_failed", {
      updateId: update.update_id,
      errorCode: failureFrom(error).code,
    });
    const chatId = privateChatId(update);
    if (chatId !== null) await sendMessage(token, chatId, PRIVATE_FAILURE_TEXT).catch(() => undefined);
  }
}
