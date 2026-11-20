import type { NextRequest } from "next/server";
import { authorizeCommunity, guarded, requireAdminSession } from "@/lib/community/apiHttp";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Community summary, configuration, module states and the viewer's live capabilities. */
export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.get", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: false });
    if (!sessionResult.ok) return sessionResult.response;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(sessionResult.session, communityId, "community.view");
    if (!authResult.ok) return authResult.response;
    return respondWithView(authResult.auth, sessionResult.session.correlationId);
  });
}
