import type { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  apiJson,
  guarded,
  liveChatMember,
  readJsonBody,
  requireAdminSession,
  telegramClientOrFailure,
  telegramUnavailable,
  withIdempotency,
  type AdminSession,
} from "@/lib/community/apiHttp";
import { evaluateModules } from "@/lib/community/botPermissions";
import { fetchBotSnapshot } from "@/lib/community/communityCommands";
import { mayClaim } from "@/lib/community/communityAuth";
import {
  claimCommunity,
  communityChatType,
  findSetupNonce,
  getActiveRoles,
  getCommunityById,
  getCommunitySettings,
  hasActiveOwner,
  isUuid,
  SETUP_NONCE_PREFIX,
} from "@/lib/community/communityRegistry";
import { TelegramApiError } from "@/lib/community/telegramApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Steps 3–4 of onboarding. `confirm: false` returns a preview (live Telegram
 * identity, community name/type and bot permissions) without writing
 * anything; `confirm: true` records the verified administrator as owner.
 *
 * A setup nonce (from the signed start_param or the body) only *selects* the
 * community and must have been issued to this user; authority always comes
 * from a live getChatMember check.
 */
export async function POST(request: NextRequest) {
  return guarded("communities.claim", async () => {
    const sessionResult = await requireAdminSession(request, { mutation: true });
    if (!sessionResult.ok) return sessionResult.response;
    const { session } = sessionResult;

    const bodyResult = await readJsonBody(request, session.correlationId);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.body;

    // A confirmed claim is idempotent end to end: a replay returns the stored
    // response even though the first request consumed the setup link.
    if (body.confirm === true) {
      return withIdempotency(request, session, "claim", body, () => claimFlow(session, body, true));
    }
    return claimFlow(session, body, false);
  });
}

async function claimFlow(session: AdminSession, body: Record<string, unknown>, confirm: boolean): Promise<NextResponse> {
  const { correlationId } = session;
  const signedNonce = session.startParam?.startsWith(SETUP_NONCE_PREFIX) ? session.startParam : undefined;
  const nonce = typeof body.nonce === "string" && body.nonce ? body.nonce : signedNonce;
  const recoverOwnership = body.recoverOwnership === true;
  const notFound = () => apiError(404, "not_found", "Community not found.", correlationId);

  let communityId: string;
  if (nonce) {
    const lookup = await findSetupNonce(nonce);
    if (!lookup || !lookup.usable) {
      return apiError(404, "not_found", "This setup link has expired or was already used. Send /setup in the group again.", correlationId);
    }
    if (lookup.issuedToTelegramUserId !== session.actor.telegramUserId) {
      return apiError(403, "forbidden", "This setup link was issued to another administrator.", correlationId);
    }
    communityId = lookup.communityId;
  } else if (isUuid(body.communityId)) {
    communityId = body.communityId;
  } else {
    return apiError(422, "validation_failed", "A setup link or community id is required.", correlationId);
  }

  const community = await getCommunityById(communityId);
  if (!community) return notFound();

  const clientResult = telegramClientOrFailure(correlationId);
  if (!clientResult.ok) return clientResult.response;
  const { client } = clientResult;

  // Without a setup link, never reveal that a community exists to a non-admin.
  const live = await liveChatMember(client, community.telegramChatId, session.actor.telegramUserId);
  if (!live.ok) return nonce ? telegramUnavailable(correlationId, live.error) : notFound();
  if (!mayClaim(live.member)) {
    return nonce
      ? apiError(403, "telegram_rights_required", "Only a current administrator of this chat can connect it.", correlationId)
      : notFound();
  }
  if (recoverOwnership && live.member?.status !== "creator") {
    return apiError(403, "forbidden", "Only the Telegram owner of this chat can recover ownership.", correlationId);
  }

  let chat;
  let snapshot;
  try {
    chat = await client.getChat(community.telegramChatId);
    snapshot = await fetchBotSnapshot(client, community.telegramChatId, communityChatType(chat) ?? community.chatType);
  } catch (error) {
    if (error instanceof TelegramApiError && error.kind === "api" && (error.errorCode === 400 || error.errorCode === 403)) {
      return apiError(409, "bot_not_in_chat", "Isnad is no longer in this chat. Add the bot again first.", correlationId);
    }
    return telegramUnavailable(correlationId, error instanceof Error ? error : new Error("Telegram error"));
  }
  if (snapshot.status === "left" || snapshot.status === "kicked") {
    return apiError(409, "bot_not_in_chat", "Isnad is no longer in this chat. Add the bot again first.", correlationId);
  }
  const chatType = communityChatType(chat) ?? community.chatType;

  if (!confirm) {
    const settings = await getCommunitySettings({ ...community, chatType });
    const roles = await getActiveRoles(community.id, session.actor.telegramUserId);
    const owned = await hasActiveOwner(community.id);
    return apiJson(
      {
        preview: {
          communityId: community.id,
          title: chat.title ?? community.title,
          chatType,
          isForum: Boolean(chat.is_forum),
          status: community.status,
          telegramStatus: live.member?.status,
          ownership: roles.includes("owner") ? "you" : owned ? "other" : "unclaimed",
          canRecoverOwnership: owned && !roles.includes("owner") && live.member?.status === "creator",
          bot: snapshot,
          modules: evaluateModules(chatType, "pending", settings, snapshot),
        },
      },
      correlationId
    );
  }

  const outcome = await claimCommunity({
    communityId: community.id,
    actor: session.actor,
    chat,
    botSnapshot: snapshot,
    nonce,
    recoverOwnership,
    correlationId,
  });
  switch (outcome.outcome) {
    case "claimed":
    case "already_owner":
    case "ownership_recovered":
      return apiJson({ communityId: outcome.community.id, outcome: outcome.outcome }, correlationId);
    case "owned_by_other":
      return apiError(
        409,
        "owned_by_other",
        "Another administrator already manages this community in Isnad. Ask them for a role.",
        correlationId,
        { canRecoverOwnership: live.member?.status === "creator" }
      );
    case "removed":
      return apiError(409, "bot_not_in_chat", "Isnad was removed from this chat. Add the bot again first.", correlationId);
    case "not_found":
      return notFound();
  }
}
