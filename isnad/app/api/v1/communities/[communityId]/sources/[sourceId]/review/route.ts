import type { NextRequest } from "next/server";
import { apiError, apiJson, authorizeCommunity, guarded, readJsonBody, requireAdminSession, withIdempotency } from "@/lib/community/apiHttp";
import { isUuid } from "@/lib/community/communityRegistry";
import { reviewSourceRecord } from "@/lib/community/sourceReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: {
  params: Promise<{ communityId: string; sourceId: string }>;
}) {
  return guarded("community.sources.review", async () => {
    const result = await requireAdminSession(request, { mutation: true });
    if (!result.ok) return result.response;
    const { session } = result;
    const { communityId, sourceId } = await context.params;
    if (!isUuid(communityId) || !isUuid(sourceId)) {
      return apiError(404, "not_found", "Source not found.", session.correlationId);
    }
    const auth = await authorizeCommunity(session, communityId, "content.review");
    if (!auth.ok) return auth.response;
    if (!session.actor.userId) {
      return apiError(403, "forbidden", "Reviewer identity required.", session.correlationId);
    }
    const json = await readJsonBody(request, session.correlationId);
    if (!json.ok) return json.response;
    const decision = json.body.decision;
    if (decision !== "approve" && decision !== "revoke") {
      return apiError(422, "validation_failed", "decision must be approve or revoke.", session.correlationId);
    }
    const keys = Object.keys(json.body);
    if ((decision === "approve" && (keys.length !== 1 || keys[0] !== "decision")) ||
        (decision === "revoke" && (keys.length !== 2 || !keys.includes("reason") ||
         typeof json.body.reason !== "string" ||
         json.body.reason.trim().length < 10 || json.body.reason.trim().length > 500))) {
      return apiError(422, "validation_failed",
        decision === "revoke" ? "Revocation needs a reason of 10–500 characters." : "Unknown review fields.",
        session.correlationId);
    }
    return withIdempotency(request, session, "sources.review:" + communityId + ":" + sourceId, json.body, async () => {
      const review = await reviewSourceRecord({
        communityId, sourceId, actorUserId: session.actor.userId!,
        actorTelegramUserId: session.actor.telegramUserId,
        correlationId: session.correlationId,
        decision, reason: typeof json.body.reason === "string" ? json.body.reason : undefined,
      });
      if (review.kind === "not_found") return apiError(404, "not_found", "Source not found.", session.correlationId);
      if (review.kind === "self_review") return apiError(403, "forbidden", "A second reviewer must approve the source.", session.correlationId);
      if (review.kind === "conflict") return apiError(409, "invalid_state", "The source review state changed. Reload and retry.", session.correlationId);
      return apiJson({ id: review.id, reviewStatus: review.kind,
        ...(review.kind === "revoked" ? { affectedFindings: review.affectedFindings } : {}) }, session.correlationId);
    });
  });
}
