# ISN-C0 — Secure Community Foundation

Status: implemented on branch `claude/friendly-hypatia-dzzbjh`, for review only.
Baseline: `8b08c63c8b483b6afce8a8fc6912a98c30d3e1ee`.

This sprint makes Isnad safe to install in a Telegram group, supergroup or
channel. A verified administrator can connect, configure and pause a community,
and the bot stays silent there. No module (assistant, verification, publisher,
learning) acts in a community yet. Each one ships in its own sprint (C1–C4).

**Nothing is active in production by default.** Every community feature is
behind `ISNAD_COMMUNITY_ENABLED` (off unless set to `true`). The only change
that takes effect on deploy without the flag is the group-safety fix: group
messages no longer reach the private conversation workflow.

---

## 1. What changed and why

| Ticket | Delivered |
| --- | --- |
| ISN-C0-01 Typed routing | `lib/community/telegramDispatcher.ts` classifies every update kind (`message`, `edited_message`, `channel_post`, `edited_channel_post`, `my_chat_member`, `chat_member`, `callback_query`, `poll`, `poll_answer`) into exactly one route. Group chatter, mentions, replies, edits and channel posts are ignored. |
| ISN-C0-02 Authenticated webhook | `lib/community/webhookIngress.ts` fails closed (503) in production when `TELEGRAM_WEBHOOK_SECRET` is missing and compares the secret in constant time. |
| ISN-C0-03 Durable inbox | `telegram_inbox` + `lib/community/telegramInbox.ts`: persist-then-acknowledge, lease-based worker, retry with backoff, and an outcome-unknown guard so one update never produces two AI replies. |
| ISN-C0-04 Migrations | `db/migrations/006_community_foundation.sql` (additive only). |
| ISN-C0-05 Live checks + RBAC | `lib/community/communityAuth.ts` (role → capability matrix) and `authorizeCommunity()` in `lib/community/apiHttp.ts` (live `getChatMember` on every request). |
| ISN-C0-06 No private crossover | Group updates never reach `handleTelegramUpdate`. That function now also refuses non-private chats as a second guard. `/history`, `/sources`, `/new`, `/settings` in a group return a short "private chat only" notice. |
| ISN-C0-07 Onboarding + dashboard | `/setup` group command, claim API, and the Mini App screen `/telegram/community` (`components/CommunityManager.tsx`). |
| ISN-C0-08 Flags, audit, pause | Feature flags (`lib/community/featureFlags.ts`), `community_audit_events`, emergency pause/resume from the group or the Mini App, and an operator-wide kill switch. |

### Service modules (handoff §C1 names)

| Module | File |
| --- | --- |
| communityRegistry | `lib/community/communityRegistry.ts` |
| communityAuth | `lib/community/communityAuth.ts`, `lib/community/apiHttp.ts` |
| telegramDispatcher | `lib/community/telegramDispatcher.ts`, `lib/community/updateProcessor.ts` |
| communityAudit | `lib/community/communityAudit.ts` |
| (supporting) | `telegramApi.ts` (typed Bot API client), `botPermissions.ts` (bot rights + module states), `settingsSchema.ts` (validated JSONB schemas), `communityCommands.ts` (group/admin command handlers), `maintenance.ts` (retention) |

`communityAssistant`, `verificationService`, `contentStudio`, `publisherWorker`
and `communityLearning` are left for C1–C4. Their configuration is already
stored and validated. `MODULE_RUNTIME_RELEASED` keeps every one of them inert.

---

## 2. Update routing

| Update | C0 behaviour |
| --- | --- |
| Private message / edit | Existing Isnad workflow, unchanged. `/community` opens the Community Manager when the flag is on. |
| Group message (no command) | Ignored. The payload is **not stored**; only the `update_id` is kept for deduplication. |
| Group `@mention`, reply to bot | Ignored (C1 adds these triggers). |
| Group edit | Ignored. |
| `/setup`, `/community`, `/pause`, `/resume` | Admin commands. The sender's rights are checked live; non-admins get no reply unless they addressed the bot (`/cmd@bot`). |
| `/help@bot` | Short group help. Unaddressed `/help` is ignored, because another bot in the chat may own it. |
| `/history@bot`, `/sources@bot`, `/new@bot`, `/settings@bot`, `/start@bot`, `/about@bot` | "Private chat only" notice. No private data is read. |
| `/ask@bot`, `/verify@bot`, `/lesson@bot`, `/quiz@bot` | "Not active in this community yet." |
| Anonymous admin (`sender_chat` = the group) | Asked to post without anonymity or to use `/community` privately. |
| Linked-channel posts, other bots, `via_bot` messages | Ignored. |
| `channel_post`, `edited_channel_post` | Ignored; never treated as a question. |
| `my_chat_member` (bot added, removed, permissions changed) | Registry update only. Nothing is sent to the chat. |
| `chat_member` | Records when a role holder gains or loses admin rights (audit). |
| Group → supergroup migration | The community follows the new chat id. |
| `callback_query`, `poll`, `poll_answer` | Ignored in C0. |

Replies always set `reply_parameters` and keep `message_thread_id` for forum topics.

## 3. Durable inbox

```
received (in request) → pending → processing → succeeded
                                     ↘ retryable_failed → processing …
                                     ↘ terminal_failed
```

- The webhook authenticates the request, writes the update and the legacy
  `processed_telegram_updates` key in one transaction, then returns 200. If
  storage fails it returns **503**, so Telegram redelivers.
- `update_id` is the primary key, so a duplicate delivery is acknowledged and not processed again.
- Workers claim a row with a 90-second lease. Handlers call `markSideEffectStarted()` before their first outbound message.
- A lease that expires **after** a side effect started is closed as
  `terminal_failed` / `outcome_unknown` and is never retried, so there is no
  second AI answer. If the side effect had not started, the update is retried.
- A send that Telegram definitively rejects (for example 429) clears the marker and retries after `retry_after`. A timeout does not, because the message may have been delivered.
- At most 5 attempts.
- Retries run after each webhook (small batch) and from `GET /api/internal/telegram-inbox` (needs `Authorization: Bearer $CRON_SECRET`). The cron schedule is **not** registered by this change.

## 4. Onboarding flow

1. **Install.** `my_chat_member` creates a `pending` community and records who installed the bot (a hint only). Nothing is sent to the chat.
2. **Setup.**
   - In a group, an admin sends `/setup`. Isnad checks their rights live and replies in-thread with `https://t.me/<bot>/<app>?startapp=cm_<nonce>`. The nonce expires in 15 minutes, is bound to that admin, and only its SHA-256 hash is stored.
   - For a channel, the admin sends `/community` in a private chat and opens the Mini App. Pending installs they added are listed as "Ready to connect".
3. **Verify.** `POST /api/v1/communities/claim`:
   - validates the signed `initData` (1-hour maximum age, future-dated values rejected);
   - takes the nonce from the signed `start_param` or the request body;
   - checks the user live with `getChatMember` (they must be an administrator or the creator);
   - fetches the bot's own rights live.
4. **Confirm.** The preview (`confirm: false`) shows the real title, type, the user's Telegram role, the bot's permissions and module compatibility. It writes nothing.
5. **Configure.** The Modules tab saves versioned settings. Incompatible modules are off automatically; for example, channels cannot use the Q&A assistant.
6. **Review and activate.** The review lists:
   - the configured features;
   - permission blockers;
   - the data-handling summary;
   - the publication policy.

   `POST …/activate` re-checks the bot's rights. It refuses with 422 if an enabled module lacks a permission, and with 409 if the settings changed since the review. Otherwise it activates in one transaction and writes an audit event.

## 5. Roles and capabilities

| Capability | owner | community_manager | content_editor | source_reviewer | publisher | analytics_viewer | Live Telegram requirement |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| community.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | member |
| community.activate | ✓ | | | | | | administrator |
| community.pause / resume | ✓ | ✓ | | | | | administrator |
| settings.update | ✓ | ✓ | | | | | administrator |
| roles.manage | ✓ | | | | | | administrator |
| audit.view | ✓ | ✓ | | | | | administrator |
| analytics.view | ✓ | ✓ | | | | ✓ | member |
| content.edit | ✓ | ✓ | ✓ | | | | member |
| content.review | | | | ✓ | | | member |
| content.publish | ✓ | | | | ✓ | | administrator |

- A capability is usable only when the user holds the role **and** has the live Telegram status it requires. An owner demoted in Telegram loses admin-only capabilities on their next request.
- The Telegram chat **creator** is always an implicit owner. Explicit ownership recovery is available with `recoverOwnership: true` on claim; the previous owner's role is revoked and the change is audited.
- The single active owner is enforced by a partial unique index.

## 6. API contracts (implemented in C0)

All endpoints require:

- the `X-Telegram-Init-Data` header (signed, at most 1 hour old by default);
- `ISNAD_COMMUNITY_ENABLED=true`;
- a database.

Rate limits are 120 reads/min and 30 writes/min per Telegram user.

Errors use the shape `{ "error": { "code", "message", … } }`, and every
response carries an `X-Request-Id` header. Unrelated users get **404**, never
403, so the existence of a private community is not disclosed.

| Method | Endpoint | Capability | Idempotency-Key | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/communities` | — | — | Communities the user can manage right now. Each one is verified live with Telegram; ones that cannot be checked are counted in `unverified`. |
| POST | `/api/v1/communities/claim` | live admin | required when `confirm: true` | Body `{ nonce? \| communityId?, confirm, recoverOwnership? }`. Returns a preview, or `{ communityId, outcome }`. |
| GET | `/api/v1/communities/:id` | community.view | — | Full `CommunityView`: settings, module states, activation blockers, viewer capabilities. |
| GET | `/api/v1/communities/:id/permissions` | community.view | — | Live bot and viewer check; refreshes the stored snapshot. |
| PATCH | `/api/v1/communities/:id/settings` | settings.update | optional | Body `{ version, timezone?, assistant?, verification?, publisher?, learning? }`. 409 on a stale version, 422 on unknown keys or broken invariants. |
| POST | `/api/v1/communities/:id/activate` | community.activate | required | Body `{ settingsVersion }`. 422 `missing_permissions`, 409 `version_conflict` / `invalid_state`. |
| POST | `/api/v1/communities/:id/pause` | community.pause | required | Body `{ reason? }`. Idempotent. |
| POST | `/api/v1/communities/:id/resume` | community.resume | required | Fresh permission check. Returns `resumed: false` and status `permission_lost` while still blocked. |
| GET | `/api/v1/communities/:id/audit` | audit.view | — | `?limit=1-100&before=<ISO>` |
| GET / POST | `/api/v1/communities/:id/roles` | audit.view / roles.manage | POST required | Body `{ telegramUserId, role }`. Ownership is not delegable. |
| DELETE | `/api/v1/communities/:id/roles/:assignmentId` | roles.manage | — | The owner role is protected (409). |
| GET | `/api/internal/telegram-inbox` | `Bearer $CRON_SECRET` | — | Drain, retention and inbox health. |

Status codes in use: 401, 403, 404, 409, 422, 429, 503.

Idempotency keys:

- are scoped per (Telegram user, endpoint scope);
- replay the stored response with the header `Idempotent-Replayed: true`;
- reject reuse with a different body (422);
- are released after a server error so the client can retry.

Proposed for later sprints and **not** implemented here: `verifications` (C2),
`content` / `schedules` (C3), `quizzes` / `analytics` (C4).

### Telegram commands

These are registered only with `ISNAD_COMMUNITY_ENABLED=true` when the setup
script runs.

| Scope | Commands |
| --- | --- |
| Default / private | existing commands + `/community` |
| `all_group_chats` | `/help` |
| `all_chat_administrators` | `/setup`, `/community`, `/pause`, `/resume`, `/help` |

`allowed_updates` gains `my_chat_member` and `chat_member` only when the flag is on.
`npm run telegram:setup -- <url> --reset-community-commands` removes the scoped menus.

## 7. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ISNAD_COMMUNITY_ENABLED` | off | Master switch for onboarding, the v1 API, group admin commands and the extra Telegram registration. |
| `ISNAD_COMMUNITY_GLOBAL_PAUSE` | off | Operator kill switch. Every module reports `paused` whatever the community state. |
| `ISNAD_COMMUNITY_ADMIN_AUTH_MAX_AGE_SECONDS` | 3600 | Maximum `initData` age for admin APIs (60–86400). |
| `TELEGRAM_BOT_USERNAME` | from `getMe` | Avoids a `getMe` call when routing `/cmd@bot`. |
| `TELEGRAM_MINI_APP_SHORT_NAME` | `askiik` | Short name in `t.me/<bot>/<app>?startapp=` links. |
| `CRON_SECRET` | — | Protects `/api/internal/telegram-inbox`; the endpoint returns 503 without it. |

## 8. Data handling and retention

| Data | Retention |
| --- | --- |
| Group messages that trigger nothing | Not stored (only `update_id`, already marked succeeded). |
| `telegram_inbox.payload` | 72 hours after completion, then nulled. |
| `telegram_inbox` rows | 30 days (deduplication window). |
| `community_interactions` (C1+) | `expires_at`, default 30 days. Never joined with private `conversations` / `messages`. |
| `community_setup_nonces` | Hash only; deleted 1 day after expiry. |
| `community_idempotency_keys` | 24 hours. |
| `community_audit_events` | Retained. Summaries only, without message content or pause reasons. Automated purge is not part of C0. |

Retention runs from `runCommunityMaintenance()` through the internal endpoint.

## 9. Migration and rollback

**Apply.**

- Production: `npm run db:migrate`, or the existing production `vercel-build` step, which runs `scripts/migrate.mjs`.
- 006 is additive. It creates 8 tables and their indexes, uses `IF NOT EXISTS` throughout, and does not touch existing tables.
- `/api/health` reports `schemaReady: false` until 006 is applied.

**Roll back the code** by reverting the merge. The new tables are not read by
the old code. One caveat for redeploying the old webhook: it deduplicates only
through `processed_telegram_updates`, which the new code keeps writing, so
cross-version deduplication holds in both directions.

**Roll back the schema** (only if required, after the code rollback):

```sql
BEGIN;
DROP TABLE IF EXISTS community_idempotency_keys, community_setup_nonces,
  community_audit_events, telegram_inbox, community_interactions,
  community_settings, community_memberships, communities;
DELETE FROM schema_migrations WHERE filename = '006_community_foundation.sql';
COMMIT;
```

**Turn the features off without a rollback:**

1. Unset `ISNAD_COMMUNITY_ENABLED`, then redeploy.
2. Optionally run `npm run telegram:setup -- <url> --reset-community-commands`.

**Emergency stop:** set `ISNAD_COMMUNITY_GLOBAL_PAUSE=true`, or `/pause` in the community.

## 10. Staging activation runbook (requires separate approval)

1. Provision a staging bot and a staging database. Run `npm run db:migrate`.
2. Set `ISNAD_COMMUNITY_ENABLED=true`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINI_APP_SHORT_NAME`, `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET`.
3. Run `npm run telegram:setup -- <staging-url>` and confirm the log shows `my_chat_member, chat_member`.
4. Add the staging bot to a test supergroup (with forum topics) and to a test channel. Run the Telegram staging checks in §11.

## 11. Test evidence

```bash
npm run typecheck                                   # passes
npm test                                            # 72 unit tests, 0 failures
TEST_DATABASE_URL=postgres://…/isnad_test npm run test:db   # 50 integration tests, 0 failures (PostgreSQL 16 + pgvector)
npm run build                                       # passes; all v1 routes and /telegram/community built
npx eslint <changed files>                          # clean
```

`npm run lint` across the whole repository still reports 21 errors and 1
warning. All of them are in files this change does not touch, and all were
present at the baseline.

Browser QA: Playwright at 390×844 against `next start` with the API mocked
from real `buildCommunityView` output. It covered:

- claim → configure → save → activate → pause, end to end;
- light and dark Telegram themes;
- no horizontal overflow on any screen;
- every request carries `initData`, and every mutation carries an `Idempotency-Key`.

### Blocking acceptance tests (handoff §I)

| # | Test | Evidence |
| --- | --- | --- |
| 1 | Cannot access another community's settings | `communityFlow` "blocking #1": 404 on read, settings and pause |
| 2 | Group commands cannot expose private history | `communityFlow` "group commands never expose…" plus dispatcher unit tests |
| 3 | One update cannot produce multiple AI replies | `inbox` "exactly one AI response…" and "crash after the AI reply started…" |
| 4 | Revoked admins cannot act | `communityFlow` "blocking #4" (403 `telegram_rights_required`), role revocation (404) |
| 5 | Publisher cannot send unapproved revision | C3 (no publisher in C0); `approvalRequired` invariant enforced (422) |
| 6 | Missing bot permission prevents the dependent action | `communityFlow` "blocking #6" (422 `missing_permissions`) |
| 7 | Verification failure not shown as authentication | C2 |
| 8 | Paused community cannot publish | `communityFlow` "blocking #8": `moduleMayAct` is false for every module; resume re-checks permissions |
| 9 | Telegram failures never silently succeed | `inbox` 429 / timeout / handler-error tests; API fails closed (503) when Telegram is unreachable |
| 10 | Existing private chat and learning keep working | `communityFlow` "blocking #10"; private dispatch unit tests; build of unchanged learning routes |

## 12. Known limitations and open risks

- **Live checks cost a Bot API call per request.** `getChatMember` runs on every admin request, and on every candidate when listing (25 at most). This is fine at admin scale; revisit with a short cache if the Community Manager grows.
- **Retries need a trigger.** Retries piggyback on webhook traffic; a quiet bot only retries when `/api/internal/telegram-inbox` is called. Schedule it (for example with Vercel Cron) at activation time.
- **Private chats are not retried after a crash.** They are marked as side-effecting before the AI call, so a crash mid-answer is not retried. The user can ask again. This is deliberate: it rules out duplicate answers.
- **Role grants use a numeric Telegram user id.** A member picker needs the Bot API's member listing, which is limited for bots.
- **A group/supergroup id collision is left for manual review.** It only arises when both chats already have configured communities.
- **Audit retention is not automated.** A legal and policy decision is needed.
- **The Mini App root loads `telegram.org/js/telegram-web-app.js`.** This is pre-existing. It is blocked in the sandbox, so screenshots were taken with the bundled SDK.
- **Engines field.** The local Node version was 22; `engines` pins 24.x. `tsx` was added as a dev dependency for tests.

## 13. Release checklist

- [ ] Code review and security review of this branch
- [ ] Migration 006 applied to staging, and `/api/health` reports `schemaReady`
- [ ] Staging Telegram checks: group, supergroup with topics, channel, anonymous admin, edited messages, bot removal, admin demotion, migration
- [ ] `CRON_SECRET` set and the inbox drain scheduled
- [ ] Alerts on `telegram_inbox_persist_failed`, `telegram_update_failed` and `telegram_inbox_attention` log events
- [ ] Restore drill for the new tables
- [ ] Explicit approval to set `ISNAD_COMMUNITY_ENABLED=true` in production
