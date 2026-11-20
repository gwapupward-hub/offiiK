import type { NextRequest } from "next/server";
import {
  apiError,
  authorizeCommunity,
  guarded,
  readJsonBody,
  requireAdminSession,
  withIdempotency,
} from "@/lib/community/apiHttp";
import { getCommunitySettings, updateCommunitySettings } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";
import { applySettingsPatch } from "@/lib/community/settingsSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Versioned partial update. The body must carry the `version` the admin
 * edited; a stale version returns 409 so concurrent edits never overwrite
 * each other. Unknown keys and broken invariants return 422.
 */
export async function PATCH(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.settings", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "settings.update");
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    const bodyResult = await readJsonBody(request, correlationId);
    if (!bodyResult.ok) return bodyResult.response;

    return withIdempotency(
      request,
      session,
      `settings:${auth.community.id}`,
      bodyResult.body,
      async () => {
        const current = await getCommunitySettings(auth.community);
        const patch = applySettingsPatch(auth.community.chatType, current, bodyResult.body);
        if (!patch.ok) {
          return apiError(422, "validation_failed", "Some settings are invalid.", correlationId, { issues: patch.issues });
        }
        const result = await updateCommunitySettings({
          community: auth.community,
          expectedVersion: patch.expectedVersion,
          settings: patch.settings,
          timezone: patch.timezone,
          changed: patch.changed,
          actor: session.actor,
          correlationId,
        });
        if (!result.ok) {
          return apiError(409, "version_conflict", "Settings were changed by someone else. Reload and try again.", correlationId, {
            currentVersion: result.currentVersion,
          });
        }
        return respondWithView(auth, correlationId);
      },
      { required: false }
    );
  });
}
