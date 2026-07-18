import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "anthropic" | "openai";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Models are overridable via env so you can bump versions without code changes.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6";
const MAX_TOKENS = 2000;

/** Normalise any incoming value to a supported provider (defaults to Claude). */
export function resolveProvider(value: unknown): Provider {
  return value === "openai" ? "openai" : "anthropic";
}

/** Returns a user-facing error string if the selected provider's key is absent. */
export function providerKeyMissing(provider: Provider): string | null {
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return "Server is missing OPENAI_API_KEY. Add it in your environment to use OpenAI.";
  }
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return "Server is missing ANTHROPIC_API_KEY. Add it in your environment to use Claude.";
  }
  return null;
}

/**
 * Sends the same system prompt + conversation to the chosen provider and
 * returns the plain-text answer. The Islamic Teacher system prompt is
 * provider-agnostic — only the transport differs. Claude is the recommended
 * default: the knowledge base and verification method were tuned against it.
 */
export async function generateAnswer(
  provider: Provider,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  if (provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
