# ISN-C1 — Staging Activation and Release Gate

Status: **code-reviewed staging preflight; live Telegram testing pending**.
Branch: `feature/isn-c1-smart-group-assistant-20261120`.
PR: https://github.com/gwapupward-hub/offiiK/pull/42
Baseline: `main` at `d07822b9e2de5c7099daca3795c6c96c18599dfd`.

No C1 production merge, rollout, production webhook changes, or main branch changes are authorized by this document.

## Verified observations (2026-11-20)

- The GitHub CI pipeline runs TypeScript, unit tests, PostgreSQL 16 + pgvector integration, build and changed-file ESLint. The final head-specific run must be green.
- Vercel provides a READY automatic Preview from the PR branch.
- The Vercel project has the **same TELEGRAM_BOT_TOKEN environment variable configured for Preview and Production**, but DATABASE_URL, TELEGRAM_WEBHOOK_SECRET, and other database credentials are configured only for Production. **Do not attempt a live Telegram staging test using this Preview.**
- The Preview is subject to Vercel deployment protection; a Telegram webhook would need a publicly reachable, appropriately secured staging endpoint.
- `scripts/telegram-setup.mjs --vercel-build` skips the Telegram setup step on non-Production Vercel builds. Do not manually run Telegram setup against the production bot's token.

## Required staging isolation

1. Provision a **separate Telegram staging bot** in BotFather with its own token, webhook and menu configuration. Do not reuse the production bot token.
2. Provision an isolated staging PostgreSQL database (with pgvector and migration 006), separate from production data.
3. Configure a staging-only Vercel environment or isolated project with staged secret values. Use branch-scoped configuration where applicable. Never copy production bot credentials or the production database into staging.
4. Required staging variables include: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `DATABASE_URL`, `CRON_SECRET`, `OPENAI_API_KEY` (staging quota), `ISNAD_COMMUNITY_ENABLED=true`, and the appropriate Mini App URL and public base URL.
5. Ensure the staging webhook endpoint can be reached by Telegram without exposing the Admin Control Center or database. Keep webhook-secret checks mandatory. Do not loosen general Preview authentication just for this test.
6. Explicitly register the staging bot webhook and allowed updates using the staging bot token, staging URL and staging secret **only after** checking the target bot identity via `getMe`.
7. Set up and verify an inbox-drain schedule protected by `CRON_SECRET`. Confirm error monitoring and a database restore drill.
8. Verify that environment health reports schema ready and that the Mini App can authenticate in Telegram.

## Live Telegram acceptance matrix

| Area | Test | Expected |
| --- | --- | --- |
| Pending group | Post chat messages before admin activation | Isnad remains silent; no ambient text retained |
| Active group | `/ask What is tawakkul?` | Single sourced answer in correct chat |
| Mention | `@<staging_bot_username> explain salah` | Single answer; username must match configured bot |
| Unrelated chatter | Ordinary user message | No reply; no text retained |
| Multi-bot | Command or mention for another bot | No Isnad answer |
| Replies | Activate `mention_and_reply` then reply to Isnad | Follow-up answer; otherwise ignored |
| Forum | Configure a Q&A topic ID | Correct topic receives replies; unrelated topics ignored |
| History | Ask from two distinct groups and a private chat | No cross-community/private data mixing |
| Permissions | Remove send/read permissions; demote an admin | Dependent operations fail closed |
| Emergency stop | Pause community and set global pause | No Q&A replies or ambient text retention |
| Duplicate update | Redeliver same update ID | Exactly one answer |
| Failures | Cause API 429, timeout and generation error | Bounded retry/outcome-unknown behavior |
| Channel | Add as channel admin and post channel update | No Q&A answer; C2/C3/C4 still off |
| Regression | Use standard private Isnad chat and learning | Both remain functional |

Record the staging bot's public username, **non-secret** Preview URL, test group/channel names, exact PR commit, PASS/FAIL evidence and timestamps. Never include bot tokens, webhook secrets, session initData or user message histories in test evidence.

## Release decision

Do not merge PR #42 until:

- Head-specific CI is all green.
- Isolated staging bot and database have been confirmed.
- The Telegram staging matrix above passes.
- Admin permission, privacy and webhook security review is accepted.
- Rollback and emergency-pause procedures are rehearsed.
- Owner issues a **separate explicit authorization to merge**.
- Production activation of `ISNAD_COMMUNITY_ENABLED` receives **another explicit approval**, even after merge.

C2 — Islamic Content Verification remains inactive until its own implementation and release gates pass.
