import type { NextRequest } from "next/server";
import { apiJson, guarded, liveChatMember, requireAdminSession, telegramClientOrFailure } from "@/lib/community/apiHttp";
import { mayClaim, resolveCapabilities } from "@/lib/community/communityAuth";
import { listCandidateCommunities } from "@/lib/community/communityRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Communities the authenticated user can manage *right now*, verified live with Telegram. */
export async function GET(request: NextRequest) {
  return guarded("communities.list", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: false });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;
    const clientResult = telegramClientOrFailure(session.correlationId);
    if (!clientResult.ok) return clientResult.response;

    const candidates = await listCandidateCommunities(session.actor.telegramUserId);
    const checks = await Promise.all(
      candidates.map((candidate) =>
        liveChatMember(clientResult.client, candidate.telegramChatId, session.actor.telegramUserId)
      )
    );

    let unverified = 0;
    const communities = candidates.flatMap((candidate, index) => {
      const check = checks[index];
      if (!check.ok) {
        unverified += 1;
        return [];
      }
      const capabilities = resolveCapabilities(candidate.roles, check.member).capabilities;
      const claimable = candidate.claimable && mayClaim(check.member);
      if (!claimable && capabilities.size === 0) return [];
      return [
        {
          id: candidate.id,
          title: candidate.title,
          chatType: candidate.chatType,
          status: candidate.status,
          roles: candidate.roles,
          claimable,
          botStatus: candidate.botStatus,
        },
      ];
    });

    return apiJson({ communities, unverified }, session.correlationId);
  });
}
