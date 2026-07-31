# Isnad — Islamic Knowledge Assistant

Isnad is a Next.js Islamic AI assistant for the web, Telegram bot, and Telegram Mini App. Every answer is governed by the Islamic Teacher Core and may route to specialist modules without allowing an add-on to override the Core.

## Knowledge hierarchy

- `knowledge/core.md` — Islamic Teacher Core: Qur'an, authentic Sunnah, the Companions, and recognized scholarship.
- `knowledge/tafsir.md` — Tafsīr Expert.
- `knowledge/hadith.md` — Hadith Sciences Expert.
- `knowledge/fiqh.md` — Fiqh Expert.
- `knowledge/muamalat.md` — Muʿāmalāt Expert, loaded beneath Fiqh for finance questions.
- `knowledge/seerah.md` — Seerah Expert.
- `knowledge/aqidah.md` — ʿAqīdah Expert.
- `knowledge/arabic.md` — Arabic Language Expert.
- `knowledge/dawah.md` — Daʿwah & Tarbiyah Expert.

The Core remains authoritative when modules overlap. References are stored with an audit state and are not marked verified merely because a model generated them.

## Phase 1 capabilities

### Telegram bot

- AI chat using the same routing pipeline as the website.
- `/start`, `/help`, `/about`, `/ask`, `/new`, `/history`, `/sources`, and `/settings`.
- Shared persistent conversation memory when PostgreSQL is configured.
- Telegram typing indicators and native message-draft streaming when supported.
- Telegram-safe rich formatting with plain-text fallback.
- Webhook secret validation and update deduplication.

### Telegram Mini App

- Mobile-first streaming chat.
- Telegram `initData` authentication.
- Shared conversation history.
- Profile and settings views.
- Answer length, Arabic text, transliteration, citation depth, theme, and memory settings.
- Telegram theme integration and native MainButton support.

### Backend

- PostgreSQL user accounts, Telegram identities, profiles, settings, conversations, messages, citations, analytics, and rate limits.
- `pgvector` and full-text search-ready knowledge tables.
- Structured logs without storing raw user prompts in application logs.
- `/api/health` readiness endpoint.
- Optional persistence: the public `/ask` route remains stateless when `DATABASE_URL` is absent.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Required for AI responses:

```text
OPENAI_API_KEY
OPENAI_MODEL
```

Required for Telegram:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_MINI_APP_URL
PUBLIC_BASE_URL
```

Required for accounts, history, citations, analytics, deduplication, and search indexing:

```text
DATABASE_URL
DATABASE_SSL
```

The PostgreSQL instance must support the `pgcrypto` and `vector` extensions.

## Database migration

```bash
npm run db:migrate
```

Migrations are applied in filename order and recorded in `schema_migrations`. They are idempotent and should be run against preview and production databases before enabling persistent features.

## Telegram setup

After deploying to an HTTPS domain, register the webhook, command menu, and Mini App button:

```bash
TELEGRAM_BOT_TOKEN=<secured-token> \
TELEGRAM_WEBHOOK_SECRET=<secured-random-secret> \
TELEGRAM_MINI_APP_URL=https://your-domain.example/telegram \
npm run telegram:setup -- https://your-domain.example
```

Never commit bot tokens, webhook secrets, OpenAI keys, or database credentials.

## API routes

- `POST /api/chat` — JSON compatibility mode or SSE when `Accept: text/event-stream` is provided.
- `GET/PATCH /api/account` — authenticated Telegram profile and settings.
- `GET/POST /api/conversations` — list or create conversations.
- `GET/DELETE /api/conversations/:id` — read or archive an owned conversation.
- `POST /api/telegram/webhook` — Telegram bot updates.
- `GET /api/health` — configuration and database readiness.

Account and conversation endpoints require a valid `X-Telegram-Init-Data` header and reject unsigned requests.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Editing knowledge modules

Content-only changes can be made directly in `knowledge/*.md`. Routing lives in `lib/knowledge.ts`; shared response preferences and citation requirements are layered by `lib/chatPipeline.ts`. Do not weaken the Core's evidence hierarchy, hadith authentication rules, certainty labels, or high-stakes referral safeguards.

## Deployment sequence

1. Provision PostgreSQL with `pgvector`.
2. Configure encrypted environment variables.
3. Run `npm run db:migrate`.
4. Deploy the Next.js application.
5. Run `npm run telegram:setup -- https://your-domain.example`.
6. Verify `/api/health`, web streaming, Mini App authentication, bot commands, history, settings, and source recall.

## License

MIT — see `LICENSE`.
