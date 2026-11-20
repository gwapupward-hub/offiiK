import type { NextRequest } from "next/server";
import { authorizeCommunity, guarded, requireAdminSession, telegramUnavailable } from "@/lib/community/apiHttp";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { saveBotSnapshot } from "@/lib/community/communityRegistry";
import type { CommunityRouteContext } from "@/lib/community/communityView";
import { respondWithView } from "@/lib/community/routeSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live Telegram check of the bot's and the viewer's rights; refreshes the stored snapshot. */
export async function GET(request: NextRequest, context: CommunityRouteContext) {
  return guarded("communities.permissions", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: false });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const { communityId } = await context.params;
    const authResult = await authorizeCommunity(session, communityId, "community.view");
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    let snapshot;
    try {
      snapshot = await fetchBotSnapshot(auth.client, auth.community.telegramChatId, auth.community.chatType);
    } catch (error) {
      return telegramUnavailable(session.correlationId, error instanceof Error ? error : new Error("Telegram error"));
    }
    await saveBotSnapshot(auth.community.id, snapshot);
    return respondWithView(auth, session.correlationId, { snapshot });
  });
}
