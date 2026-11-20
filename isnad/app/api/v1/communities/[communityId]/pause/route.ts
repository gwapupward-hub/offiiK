import type { NextRequest } from "next/server";
import {
  apiError,
  authorizeCommunity,
  guarded,
  readJsonBody,
  requireAdminSession,
  withIdempotency,
} from "@/lib/community/apiHttp";
import { pauseCommunity } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Emergency pause: stops AI replies, publishing and learning announcements. Read-only admin stays available. */
export async function POST(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.pause", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "community.pause");
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    const bodyResult = await readJsonBody(request, correlationId);
    if (!bodyResult.ok) return bodyResult.response;
    const reason = typeof bodyResult.body.reason === "string" ? bodyResult.body.reason.trim() : undefined;

    return withIdempotency(request, session, `pause:${auth.community.id}`, bodyResult.body, async () => {
      const result = await pauseCommunity({
        communityId: auth.community.id,
        reason,
        actor: session.actor,
        source: "mini_app",
        correlationId,
      });
      if (!result.ok) {
        return apiError(409, "invalid_state", "This community can't be paused from its current state.", correlationId);
      }
      return respondWithView(auth, correlationId, { community: result.community, extra: { changed: result.changed } });
    });
  });
}
