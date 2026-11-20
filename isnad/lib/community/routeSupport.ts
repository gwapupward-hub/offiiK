import type { NextResponse } from "next/server";
import { apiJson, type AuthorizedCommunity } from "@/lib/community/apiHttp";
import { getCommunityById, getCommunitySettings } from "@/lib/community/communityRegistry";
import { buildCommunityView } from "@/lib/community/communityView";
import type { BotPermissionSnapshot, CommunityRecord } from "@/lib/community/types";

/** Reloads the community (after a mutation) and responds with its full view. */
export async function respondWithView(
  auth: AuthorizedCommunity,
  correlationId: string,
  options: {
    community?: CommunityRecord;
    snapshot?: Partial<BotPermissionSnapshot>;
    extra?: Record<string, unknown>;
    status?: number;
  } = {}
): Promise<NextResponse> {
  const community = options.community ?? (await getCommunityById(auth.community.id)) ?? auth.community;
  const settings = await getCommunitySettings(community);
  const view = buildCommunityView({
    community,
    settings,
    snapshot: options.snapshot,
    roles: auth.roles,
    capabilities: auth.capabilities,
    liveMember: auth.liveMember,
  });
  return apiJson({ community: view, ...options.extra }, correlationId, options.status ?? 200);
}
