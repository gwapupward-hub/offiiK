import OpenAI from "openai";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Model is overridable via env so you can bump versions without code changes.
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6";
const MAX_TOKENS = 2000;

/** Returns a user-facing error string if the OpenAI key is absent. */
export function openAiKeyMissing(): string | null {
  if (!process.env.OPENAI_API_KEY) {
    return "Server is missing OPENAI_API_KEY. Add it in your environment to use OpenAI.";
  }
  return null;
}

/**
 * Sends the Islamic Teacher system prompt + conversation to OpenAI and returns
 * the plain-text answer. The system prompt is model-agnostic — only the
 * transport lives here.
 */
export async function generateAnswer(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
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
