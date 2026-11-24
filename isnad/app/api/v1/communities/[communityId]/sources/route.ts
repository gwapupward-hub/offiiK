import type { NextRequest } from "next/server";
import { apiError, apiJson, authorizeCommunity, guarded, readJsonBody, requireAdminSession, withIdempotency } from "@/lib/community/apiHttp";
import { isUuid } from "@/lib/community/communityRegistry";
import { listCommunitySources, parseDraftSource, submitSourceDraft } from "@/lib/community/sourceReview";
import type { CommunityRouteContext } from "@/lib/community/communityView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only assigned editors/reviewers may inspect a community's draft source texts. */
export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("community.sources.list", async () => {
    const result = await requireAdminSession(request, { mutation: false });
    if (!result.ok) return result.response;
    const { communityId } = await context.params;
    const auth = await authorizeCommunity(result.session, communityId, "community.view");
    if (!auth.ok) return auth.response;
    if (!auth.auth.capabilities.has("content.edit") && !auth.auth.capabilities.has("content.review")) {
      return apiError(403, "forbidden", "Source access requires an editor or reviewer role.", result.session.correlationId);
    }
    return apiJson({ sources: await listCommunitySources(auth.auth.community.id) }, result.session.correlationId);
  });
}

export async function POST(request: NextRequest, context: CommunityRouteContext) {
  return guarded("community.sources.submit", async () => {
    const result = await requireAdminSession(request, { mutation: true });
    if (!result.ok) return result.response;
    const { session } = result;
    const { communityId } = await context.params;
    if (!isUuid(communityId)) return apiError(404, "not_found", "Community not found.", session.correlationId);
    const auth = await authorizeCommunity(session, communityId, "content.edit");
    if (!auth.ok) return auth.response;
    if (!session.actor.userId) return apiError(403, "forbidden", "An identified editor is required.", session.correlationId);
    const json = await readJsonBody(request, session.correlationId);
    if (!json.ok) return json.response;
    const parsed = parseDraftSource(json.body);
    if (!parsed.ok) {
      return apiError(422, "validation_failed", "Source metadata is incomplete.", session.correlationId, { issues: parsed.issues });
    }
    return withIdempotency(request, session, "sources.submit:" + auth.auth.community.id, json.body, async () => {
      try {
        const id = await submitSourceDraft({
          communityId: auth.auth.community.id, actorUserId: session.actor.userId!,
          actorTelegramUserId: session.actor.telegramUserId,
          correlationId: session.correlationId, draft: parsed.value,
        });
        return apiJson({ id, reviewStatus: "pending" }, session.correlationId, 201);
      } catch (e) {
        if ((e as {code?: string}).code === "23505") {
          return apiError(409, "conflict", "A source with these edition identifiers already exists.", session.correlationId);
        }
        throw e;
      }
    });
  });
}
