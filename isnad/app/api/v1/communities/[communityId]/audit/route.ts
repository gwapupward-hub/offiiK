import type { NextRequest } from "next/server";
import { apiJson, authorizeCommunity, guarded, requireAdminSession } from "@/lib/community/apiHttp";
import { listAuditEvents } from "@/lib/community/communityAudit";
import type { CommunityRouteContext } from "@/lib/community/communityView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Audit history, newest first. `?before=<ISO timestamp>&limit=<1-100>` pages backwards. */
export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.audit", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: false });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "audit.view");
    if (!authResult.ok) return authResult.response;

    const params = request.nextUrl.searchParams;
    const events = await listAuditEvents(authResult.auth.community.id, {
      limit: Number(params.get("limit") ?? 50),
      before: params.get("before") ?? undefined,
    });
    return apiJson({ events }, session.correlationId);
  });
}
