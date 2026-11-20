import type { NextRequest } from "next/server";
import {
  apiError,
  apiJson,
  authorizeCommunity,
  guarded,
  readJsonBody,
  requireAdminSession,
  withIdempotency,
} from "@/lib/community/apiHttp";
import { DELEGABLE_ROLES } from "@/lib/community/communityAuth";
import { grantRole, listRoleAssignments } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import type { CommunityRole } from "@/lib/community/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.roles.list", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: false });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "audit.view");
    if (!authResult.ok) return authResult.response;
    const assignments = await listRoleAssignments(authResult.auth.community.id);
    return apiJson({ assignments, delegableRoles: DELEGABLE_ROLES }, session.correlationId);
  });
}

/** Owner delegates an application role. The holder still needs live Telegram rights to use it. */
export async function POST(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.roles.grant", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "roles.manage");
    if (!authResult.ok) return authResult.response;

    const bodyResult = await readJsonBody(request, correlationId);
    if (!bodyResult.ok) return bodyResult.response;
    const { telegramUserId, role } = bodyResult.body;
    if (typeof telegramUserId !== "number" || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
      return apiError(422, "validation_failed", "telegramUserId must be a Telegram user id.", correlationId);
    }
    if (typeof role !== "string" || !DELEGABLE_ROLES.includes(role as CommunityRole)) {
      return apiError(422, "validation_failed", `role must be one of: ${DELEGABLE_ROLES.join(", ")}.`, correlationId);
    }

    return withIdempotency(request, session, `roles:${authResult.auth.community.id}`, bodyResult.body, async () => {
      const result = await grantRole({
        communityId: authResult.auth.community.id,
        targetTelegramUserId: telegramUserId,
        role: role as CommunityRole,
        actor: session.actor,
        correlationId,
      });
      if (!result.ok) return apiError(422, "validation_failed", "That role can't be delegated.", correlationId);
      const assignments = await listRoleAssignments(authResult.auth.community.id);
      return apiJson({ assignmentId: result.assignmentId, assignments }, correlationId, 201);
    });
  });
}
