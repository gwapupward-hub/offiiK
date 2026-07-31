import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SETTINGS, type RoutingFlags } from "@/lib/appTypes";
import { buildConfiguredPrompt, routeQuestion } from "@/lib/chatPipeline";
import { extractCitations } from "@/lib/citations";
import { databaseConfigured } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateAnswer,
  getOpenAiModel,
  openAiKeyMissing,
  streamAnswer,
  type ChatMessage,
} from "@/lib/providers";
import {
  consumeRateLimit,
  createConversation,
  getConversationMessages,
  listConversations,
  rateLimitKey,
  recordEvent,
  saveMessage,
} from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function validMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 50 &&
    value.every(
      (message) =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        message.content.length <= 12_000
    )
  );
}

async function persistAssistant(input: {
  conversationId: string | null;
  answer: string;
  routing: RoutingFlags;
}) {
  const citations = extractCitations(input.answer);
  let messageId: string | null = null;
  if (input.conversationId) {
    messageId = await saveMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: input.answer,
      model: getOpenAiModel(),
      routing: input.routing,
      citations,
    });
  }
  return { citations, messageId };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages?: unknown;
      conversationId?: string;
    };
    if (!validMessages(body.messages)) {
      return NextResponse.json({ error: "Valid chat messages are required." }, { status: 400 });
    }

    const keyError = openAiKeyMissing();
    if (keyError) return NextResponse.json({ error: keyError }, { status: 500 });

    const session = await resolveTelegramSession(request);
    if (session && !session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const requester = session?.userId ?? String(session?.user.id ?? forwardedFor ?? "anonymous");
    const rateLimit = await consumeRateLimit(rateLimitKey(requester));
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const incoming = body.messages;
    const question = [...incoming].reverse().find((message) => message.role === "user")?.content.trim();
    if (!question) {
      return NextResponse.json({ error: "A user question is required." }, { status: 400 });
    }

    const settings = session?.settings ?? DEFAULT_SETTINGS;
    const routing = routeQuestion(question);
    const systemPrompt = buildConfiguredPrompt(question, settings);

    let conversationId: string | null = null;
    let modelMessages = incoming.slice(-20);

    if (session?.userId && databaseConfigured()) {
      const conversations = await listConversations(session.userId, 100);
      const requested = body.conversationId
        ? conversations.find((conversation) => conversation.id === body.conversationId)
        : undefined;
      const conversation = requested ?? (await createConversation(session.userId, "mini_app"));
      conversationId = conversation.id;

      if (settings.memoryEnabled) {
        const history = await getConversationMessages(session.userId, conversation.id, 30);
        modelMessages = history.map(({ role, content }) => ({ role, content }));
        modelMessages.push({ role: "user", content: question });
      }

      await saveMessage({
        conversationId,
        role: "user",
        content: question,
      });
    }

    const wantsStream = request.headers.get("accept")?.includes("text/event-stream");
    if (!wantsStream) {
      const answer = await generateAnswer(systemPrompt, modelMessages);
      const persisted = await persistAssistant({ conversationId, answer, routing });
      await recordEvent("chat_completed", session?.userId ?? null, {
        channel: session ? "mini_app" : "web",
        model: getOpenAiModel(),
        citationCount: persisted.citations.length,
      });
      return NextResponse.json({
        answer,
        conversationId,
        citations: persisted.citations,
        ...routing,
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(sse("meta", { conversationId, ...routing }));
        let answer = "";
        const startedAt = Date.now();
        try {
          for await (const delta of streamAnswer(systemPrompt, modelMessages)) {
            answer += delta;
            controller.enqueue(sse("delta", { delta }));
          }

          const persisted = await persistAssistant({ conversationId, answer, routing });
          await recordEvent("chat_completed", session?.userId ?? null, {
            channel: session ? "mini_app" : "web",
            model: getOpenAiModel(),
            citationCount: persisted.citations.length,
            latencyMs: Date.now() - startedAt,
          });
          controller.enqueue(
            sse("done", {
              conversationId,
              messageId: persisted.messageId,
              citations: persisted.citations,
              ...routing,
            })
          );
        } catch (error) {
          logger.error("chat_stream_failed", {
            error: error instanceof Error ? error.message : "Unknown streaming error",
          });
          controller.enqueue(
            sse("error", {
              error: "Something went wrong answering this question. Please try again.",
            })
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    logger.error("chat_route_failed", {
      error: error instanceof Error ? error.message : "Unknown chat route error",
    });
    return NextResponse.json(
      { error: "Something went wrong answering this question. Please try again." },
      { status: 500 }
    );
  }
}
