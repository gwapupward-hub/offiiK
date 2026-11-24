import type { NextRequest } from "next/server";
import { apiJson, authorizeCommunity, guarded, requireAdminSession } from "@/lib/community/apiHttp";
import { listSourceCorrections } from "@/lib/community/sourceReview";
import type { CommunityRouteContext } from "@/lib/community/communityView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only independent source reviewers can see the internal correction queue. */
export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("community.sources.corrections", async () => {
    const result = await requireAdminSession(request, { mutation: false });
    if (!result.ok) return result.response;
    const { communityId } = await context.params;
    const auth = await authorizeCommunity(result.session, communityId, "content.review");
    if (!auth.ok) return auth.response;
    const notices = await listSourceCorrections(auth.auth.community.id);
    return apiJson({ corrections: notices }, result.session.correlationId);
  });
}
