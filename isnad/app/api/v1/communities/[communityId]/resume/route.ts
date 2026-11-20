import type { NextRequest } from "next/server";
import {
  apiError,
  authorizeCommunity,
  guarded,
  requireAdminSession,
  telegramUnavailable,
  withIdempotency,
} from "@/lib/community/apiHttp";
import { blockedModules, evaluateModules } from "@/lib/community/botPermissions";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { getCommunitySettings, resumeCommunity } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lifts a pause after a *fresh* permission check. If an enabled module is
 * still missing a permission the community moves to permission_lost.
 */
export async function POST(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.resume", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "community.resume");
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    return withIdempotency(request, session, `resume:${auth.community.id}`, {}, async () => {
      let snapshot;
      try {
        snapshot = await fetchBotSnapshot(auth.client, auth.community.telegramChatId, auth.community.chatType);
      } catch (error) {
        return telegramUnavailable(correlationId, error instanceof Error ? error : new Error("Telegram error"));
      }
      const settings = await getCommunitySettings(auth.community);
      const blocked = blockedModules(evaluateModules(auth.community.chatType, "active", settings, snapshot, { globalPause: false }));
      const result = await resumeCommunity({
        communityId: auth.community.id,
        snapshot,
        blocked: blocked.length > 0 || snapshot.status === "left" || snapshot.status === "kicked",
        actor: session.actor,
        source: "mini_app",
        correlationId,
      });
      if (!result.ok) {
        return apiError(409, "invalid_state", "Only a paused community can be resumed.", correlationId);
      }
      return respondWithView(auth, correlationId, {
        community: result.community,
        snapshot,
        extra: {
          resumed: result.community.status !== "permission_lost",
          blockedModules: blocked.map((module) => ({ key: module.key, missing: module.missingPermissions })),
        },
      });
    });
  });
}
