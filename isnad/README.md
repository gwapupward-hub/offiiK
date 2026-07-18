# Isnad — Islamic Knowledge Assistant

A Next.js chat app that answers Islamic-knowledge questions using Claude, grounded
by two uploaded skill files as system prompts:

- `knowledge/core.md` — Islamic Teacher Core (Qur'an → Sunnah → Companions → Scholars)
- `knowledge/muamalat.md` — Muʿāmalāt Expert add-on (Islamic finance), auto-routed
  in for finance-related questions per its own `integration.md` rules, layered on
  top of the Core with "core authority > add-on" as the conflict rule.

## How it works

- `lib/knowledge.ts` builds the system prompt at request time: always loads the
  Core, and loads the finance add-on only when the question matches finance
  keywords (ribā, zakāh, crypto, mortgage, business, inheritance, etc.).
- `app/api/chat/route.ts` is a server-side API route that calls either the
  Anthropic or the OpenAI API with that system prompt. Your API keys never reach
  the browser.
- `lib/providers.ts` routes a request to Claude or OpenAI. The same
  provider-agnostic system prompt is sent to both; only the transport differs.
- `app/page.tsx` is the chat UI, including a **Claude / OpenAI** model toggle in
  the input bar.

## Model toggle (Claude / OpenAI)

Users pick the answering model with the toggle above the input box. Claude is the
default and recommended choice — the knowledge base and verification method were
tuned against it. OpenAI is available for comparison and as an alternative.

- Claude uses `claude-sonnet-5`; OpenAI uses `gpt-5.6`.
- Both are overridable via the `ANTHROPIC_MODEL` / `OPENAI_MODEL` env vars — no
  code change needed.
- Each provider only needs its own key. If a user selects OpenAI but
  `OPENAI_API_KEY` isn't set, that request returns a clear error and Claude keeps
  working (and vice-versa).

## Setup

```bash
npm install
cp .env.example .env.local
# put your real key in .env.local
npm run dev
```

Get an API key at https://console.anthropic.com/

## Deploy

Works out of the box on Vercel:

```bash
vercel
```

Add your keys as environment variables in your Vercel project settings
(Project → Settings → Environment Variables) before deploying:

- `ANTHROPIC_API_KEY` — required for the Claude toggle (the default).
- `OPENAI_API_KEY` — required only for the OpenAI toggle.
- `TELEGRAM_BOT_TOKEN` — required only for the Telegram Mini App (see below).

They're read at runtime, not build time, so a missing key won't fail the build —
it'll only fail requests that need it. Redeploy after adding or changing env vars.

## Telegram Mini App

The app ships a Telegram Mini App at the **`/telegram`** route. It's the same
chat experience as the web app (same `/api/chat` route, same answer/source-chain
UI), wrapped in a Telegram-native shell: it boots the Telegram Web App SDK,
mirrors the user's Telegram light/dark theme, and uses Telegram's native
**MainButton** as the primary "Ask" action.

Requests from the Mini App carry Telegram's signed `initData` in an
`X-Telegram-Init-Data` header. The chat API validates it server-side with
`lib/telegramAuth.ts` (HMAC-SHA256 per Telegram's documented scheme, plus an
`auth_date` freshness check) using `TELEGRAM_BOT_TOKEN`, and rejects requests
that fail validation with a 401. Ordinary web requests (no header) are
unaffected.

### Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) via `/newbot`, and copy
   the bot token it gives you.
2. In BotFather, run `/newapp`, choose your bot, and register the Mini App URL as
   `https://<your-vercel-domain>/telegram`.
3. Set `TELEGRAM_BOT_TOKEN` (the token from step 1) as an environment variable in
   your Vercel project settings — the same place `ANTHROPIC_API_KEY` is set. It's
   read at runtime, so redeploy (or push) after adding it.

Once set, opening the Mini App from Telegram will hit `/telegram`, and every
question is verified against your bot token before it's answered.

## Editing the knowledge base

Update `knowledge/core.md` or `knowledge/muamalat.md` directly — no code changes
needed, they're read fresh from disk on each server start. To add another skill
(e.g. a Seerah or Fiqh-of-Worship add-on), drop a new `.md` file in `knowledge/`,
read it in `lib/knowledge.ts`, and add routing keywords the same way the finance
add-on is routed.

## Notes

- This is educational guidance, not a binding fatwa — the system prompt instructs
  the model to say so and to refer high-stakes matters (divorce, inheritance,
  apostasy rulings, etc.) to a qualified local scholar, per the uploaded skill's
  own safety rules.
- Models: `claude-sonnet-5` (Claude) and `gpt-5.6` (OpenAI), both overridable via
  the `ANTHROPIC_MODEL` / `OPENAI_MODEL` env vars.

## UX structure

Answers are rendered from the structure the Core skill already mandates in its
**Answer Format** section — no prompt changes were needed to support this:

- `lib/parseAnswer.ts` splits an answer on its `###` headings and maps them to
  the isnād tiers (Qur'an → Sunnah → Companions → Scholars), the practical
  guidance, and the **Degree of Certainty**.
- `components/SourceChain.tsx` renders the tiers as a collapsible
  "Traced through" chain beneath each answer. Tiers with no content are omitted,
  so the chain shows what an answer actually rests on.
- `components/CertaintyChip.tsx` surfaces the skill's five enumerated certainty
  levels as a colour-coded chip at the top of the card — legitimate scholarly
  disagreement is shown, never buried.
- If the model answers without the mandated headings (the skill says to use them
  "when appropriate", so short factual answers may not), `parseAnswer` reports
  `structured: false` and the raw markdown renders as before. No content is lost.

`components/ChainLoader.tsx` is deliberately ambient rather than stepped: the API
call is non-streaming, so there is no real per-tier progress to report, and
inventing it would undercut the premise of the app.

`design/ux-reference.html` is a standalone, dependency-free page showing the
landing, conversation, loading and error states for design iteration. The app is
the source of truth; the reference is kept in sync by hand.

## Knowledge source specs

`docs/knowledge-sources/` holds the full original skill specs (Islamic Teacher
Core and the Muʿāmalāt Expert add-on, with its manifest, integration rules,
sourcing policy, and red-team evaluation questions) that `knowledge/core.md`
and `knowledge/muamalat.md` were derived from. Kept for provenance and future
edits — not read at runtime.

## License

MIT — see `LICENSE`.
