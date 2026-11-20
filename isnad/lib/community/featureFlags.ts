import type { ModuleKey } from "@/lib/community/types";

type Env = Record<string, string | undefined>;

/**
 * Master switch for community onboarding, the /api/v1/communities API, and the
 * group admin commands. Off unless explicitly enabled, so merging this code
 * does not activate anything in production.
 */
export function communityFeaturesEnabled(env: Env = process.env): boolean {
  return env.ISNAD_COMMUNITY_ENABLED === "true";
}

/** Operator kill switch: stops all community automation regardless of per-community state. */
export function communityGlobalPause(env: Env = process.env): boolean {
  return env.ISNAD_COMMUNITY_GLOBAL_PAUSE === "true";
}

/**
 * Whether a module's runtime has shipped. C0 ships configuration only; each
 * flag flips in its own sprint (C1–C4) after that sprint's release gate.
 * While false, a module can be configured but never acts in a community.
 */
export const MODULE_RUNTIME_RELEASED: Readonly<Record<ModuleKey, boolean>> = Object.freeze({
  assistant: false,
  verification: false,
  publisher: false,
  learning: false,
});

export function adminAuthMaxAgeSeconds(env: Env = process.env): number {
  const configured = Number(env.ISNAD_COMMUNITY_ADMIN_AUTH_MAX_AGE_SECONDS);
  if (Number.isFinite(configured) && configured >= 60 && configured <= 86_400) {
    return Math.trunc(configured);
  }
  return 3_600;
}

export function isProductionRuntime(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}
