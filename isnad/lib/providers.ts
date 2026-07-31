import OpenAI from "openai";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6";
const MAX_TOKENS = 2000;

export function getOpenAiModel(): string {
  return OPENAI_MODEL;
}

export function openAiKeyMissing(): string | null {
  if (!process.env.OPENAI_API_KEY) {
    return "Server is missing OPENAI_API_KEY. Add it in your environment to use OpenAI.";
  }
  return null;
}

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function* streamAnswer(
  systemPrompt: string,
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const stream = await client().chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: MAX_TOKENS,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function generateAnswer(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  let answer = "";
  for await (const delta of streamAnswer(systemPrompt, messages)) {
    answer += delta;
  }
  return answer;
}
