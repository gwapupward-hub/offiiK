import type { NextRequest } from "next/server";
import {
  apiError, apiJson, authorizeCommunity, guarded, requireAdminSession, withIdempotency,
} from "@/lib/community/apiHttp";
import { isUuid } from "@/lib/community/communityRegistry";
import { acknowledgeSourceCorrection } from "@/lib/community/sourceReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: {
  params: Promise<{ communityId: string; noticeId: string }>;
}) {
  return guarded("community.sources.corrections.acknowledge", async () => {
    const result = await requireAdminSession(request, { mutation: true });
    if (!result.ok) return result.response;
    const { session } = result;
    const { communityId, noticeId } = await context.params;
    if (!isUuid(communityId) || !isUuid(noticeId)) {
      return apiError(404, "not_found", "Correction item not found.", session.correlationId);
    }
    const auth = await authorizeCommunity(session, communityId, "content.review");
    if (!auth.ok) return auth.response;
    if (!session.actor.userId) return apiError(403, "forbidden", "Reviewer identity required.", session.correlationId);
    return withIdempotency(request, session,
      "sources.corrections.ack:" + communityId + ":" + noticeId, {}, async () => {
        const status = await acknowledgeSourceCorrection({
          communityId, noticeId, actorUserId: session.actor.userId!,
          actorTelegramUserId: session.actor.telegramUserId,
          correlationId: session.correlationId,
        });
        if (status === "not_found") return apiError(404, "not_found", "Correction item not found.", session.correlationId);
        if (status === "conflict") return apiError(409, "invalid_state", "Already acknowledged.", session.correlationId);
        // Acknowledgment is an internal review state; it does not mean
        // any Telegram user was notified or any religious judgment was replaced.
        return apiJson({ noticeId, status: "acknowledged", notified: false }, session.correlationId);
      }
    );
  });
}
