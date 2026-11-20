import { after, NextRequest } from "next/server";
import { ingestTelegramWebhook } from "@/lib/community/webhookIngress";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { response, followUp } = await ingestTelegramWebhook(request);
  if (followUp) after(followUp);
  return response;
}
