import { NextRequest, NextResponse } from "next/server";
import {
  type AnswerLength,
  type CitationDepth,
  type ThemePreference,
  type UserSettings,
} from "@/lib/appTypes";
import { logger } from "@/lib/logger";
import {
  getProfile,
  getSettings,
  recordEvent,
  updateProfile,
  updateSettings,
} from "@/lib/store";
import { resolveTelegramSession } from "@/lib/telegramSession";

export const runtime = "nodejs";

const ANSWER_LENGTHS = new Set<AnswerLength>(["concise", "balanced", "detailed"]);
const CITATION_DEPTHS = new Set<CitationDepth>(["standard", "detailed"]);
const THEMES = new Set<ThemePreference>(["system", "light", "dark"]);

function authError(session: Awaited<ReturnType<typeof resolveTelegramSession>>) {
  if (!session || session.ok) return null;
  return NextResponse.json({ error: session.error }, { status: session.status });
}

export async function GET(request: NextRequest) {
  const session = await resolveTelegramSession(request, {
    required: true,
    requireDatabase: true,
  });
  const errorResponse = authError(session);
  if (errorResponse) return errorResponse;
  if (!session || !session.ok || !session.userId) {
    return NextResponse.json({ error: "Account unavailable." }, { status: 503 });
  }

  const [profile, settings] = await Promise.all([
    getProfile(session.userId),
    getSettings(session.userId),
  ]);
  return NextResponse.json({ profile, settings });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await resolveTelegramSession(request, {
      required: true,
      requireDatabase: true,
    });
    const errorResponse = authError(session);
    if (errorResponse) return errorResponse;
    if (!session || !session.ok || !session.userId) {
      return NextResponse.json({ error: "Account unavailable." }, { status: 503 });
    }

    const body = (await request.json()) as {
      profile?: { displayName?: unknown; bio?: unknown };
      settings?: Partial<UserSettings>;
    };

    let profile = await getProfile(session.userId);
    let settings = await getSettings(session.userId);

    if (body.profile) {
      const displayName =
        typeof body.profile.displayName === "string"
          ? body.profile.displayName.trim().slice(0, 80)
          : profile?.displayName ?? session.user.first_name;
      const bio =
        typeof body.profile.bio === "string"
          ? body.profile.bio.trim().slice(0, 500)
          : profile?.bio ?? "";
      if (!displayName) {
        return NextResponse.json({ error: "Display name cannot be empty." }, { status: 400 });
      }
      profile = await updateProfile(session.userId, { displayName, bio });
    }

    if (body.settings) {
      const proposed = { ...settings, ...body.settings };
      if (!ANSWER_LENGTHS.has(proposed.answerLength)) {
        return NextResponse.json({ error: "Invalid answer length." }, { status: 400 });
      }
      if (!CITATION_DEPTHS.has(proposed.citationDepth)) {
        return NextResponse.json({ error: "Invalid citation depth." }, { status: 400 });
      }
      if (!THEMES.has(proposed.theme)) {
        return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
      }
      proposed.language = String(proposed.language || "en").slice(0, 16);
      proposed.madhhabContext = String(proposed.madhhabContext || "balanced").slice(0, 80);
      proposed.showArabic = Boolean(proposed.showArabic);
      proposed.transliteration = Boolean(proposed.transliteration);
      proposed.memoryEnabled = Boolean(proposed.memoryEnabled);
      settings = await updateSettings(session.userId, proposed);
    }

    await recordEvent("account_updated", session.userId, {
      profileUpdated: Boolean(body.profile),
      settingsUpdated: Boolean(body.settings),
    });
    return NextResponse.json({ profile, settings });
  } catch (error) {
    logger.error("account_update_failed", {
      error: error instanceof Error ? error.message : "Unknown account error",
    });
    return NextResponse.json({ error: "Unable to update the account." }, { status: 500 });
  }
}
