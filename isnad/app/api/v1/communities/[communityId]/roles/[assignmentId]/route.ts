import type { NextRequest } from "next/server";
import { apiError, apiJson, authorizeCommunity, guarded, requireAdminSession } from "@/lib/community/apiHttp";
import { listRoleAssignments, revokeRole } from "@/lib/community/communityRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ communityId: string; assignmentId: string }> };

/** Revokes a delegated role. Ownership is changed only through the recovery flow. */
export async function DELETE(request: NextRequest, context: Context) {
  return guarded("communities.roles.revoke", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId, assignmentId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "roles.manage");
    if (!authResult.ok) return authResult.response;

    const outcome = await revokeRole({
      communityId: authResult.auth.community.id,
      assignmentId,
      actor: session.actor,
      correlationId,
    });
    if (outcome === "not_found") return apiError(404, "not_found", "Role assignment not found.", correlationId);
    if (outcome === "owner_protected") {
      return apiError(409, "conflict", "The owner role can't be revoked here. Use ownership recovery.", correlationId);
    }
    const assignments = await listRoleAssignments(authResult.auth.community.id);
    return apiJson({ revoked: true, assignments }, correlationId);
  });
}
