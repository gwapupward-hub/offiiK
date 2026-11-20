import type { NextRequest } from "next/server";
import {
  apiError,
  authorizeCommunity,
  guarded,
  readJsonBody,
  requireAdminSession,
  telegramUnavailable,
  withIdempotency,
} from "@/lib/community/apiHttp";
import { blockedModules, evaluateModules } from "@/lib/community/botPermissions";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { activateCommunity, getCommunitySettings } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 6. Activates a pending community after a fresh bot-permission check.
 * Enabled modules missing a required permission block activation (422);
 * `settingsVersion` must match the configuration the admin reviewed (409).
 */
export async function POST(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.activate", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { correlationId } = session;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "community.activate");
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    const bodyResult = await readJsonBody(request, correlationId);
    if (!bodyResult.ok) return bodyResult.response;
    const expectedVersion = bodyResult.body.settingsVersion;
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return apiError(422, "validation_failed", "settingsVersion is required.", correlationId);
    }

    return withIdempotency(request, session, `activate:${auth.community.id}`, bodyResult.body, async () => {
      let snapshot;
      try {
        snapshot = await fetchBotSnapshot(auth.client, auth.community.telegramChatId, auth.community.chatType);
      } catch (error) {
        return telegramUnavailable(correlationId, error instanceof Error ? error : new Error("Telegram error"));
      }
      if (snapshot.status === "left" || snapshot.status === "kicked") {
        return apiError(409, "bot_not_in_chat", "Isnad is not a member of this chat.", correlationId);
      }
      const settings = await getCommunitySettings(auth.community);
      const blocked = blockedModules(evaluateModules(auth.community.chatType, "active", settings, snapshot, { globalPause: false }));
      if (blocked.length > 0) {
        return apiError(422, "missing_permissions", "Grant the missing bot permissions or turn those modules off.", correlationId, {
          modules: blocked.map((module) => ({ key: module.key, missing: module.missingPermissions })),
        });
      }
      const result = await activateCommunity({
        communityId: auth.community.id,
        expectedVersion,
        snapshot,
        actor: session.actor,
        correlationId,
      });
      if (!result.ok) {
        return result.reason === "version_conflict"
          ? apiError(409, "version_conflict", "Settings changed since you reviewed them. Review again.", correlationId, {
              currentVersion: result.currentVersion,
            })
          : apiError(409, "invalid_state", `A ${result.status ?? "non-pending"} community can't be activated.`, correlationId);
      }
      return respondWithView(auth, correlationId, { community: result.community, snapshot, extra: { changed: result.changed } });
    });
  });
}
