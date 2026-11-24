# ISN-C1 — Smart Group Assistant

Baseline: C0 merge d07822b9e2de5c7099daca3795c6c96c18599dfd
Branch: feature/isn-c1-smart-group-assistant-20261120

Status: isolated implementation for review. No production approval, merge, or activation.

## Scope

- Group and supergroup /ask, @bot mentions, optional replies to the bot, and optional selected forum Q&A topics.
- Strict per-community and topic context boundaries; never include private conversation history.
- Per-user cooldown, per-community burst, hourly and daily rate limits.
- Correct reply-to-message and forum topic IDs.
- Community status, bot permissions, runtime release gates, and global pause.
- Channel posts ignored; verification, publisher, and learning runtimes remain gated.

## User experience

Default mode: mention_only. Ordinary discussion is ignored.
Members use /ask followed by a question or mention the bot by its exact username.
Admins may choose mention_and_reply or qa_topics with selected topic IDs.
Unconfigured topics are not processed.

Replies follow the Islamic Teacher Core, with source referencing, uncertainty,
and guidance toward qualified scholars for high-stakes personal rulings.
C1 does not provide hadith authentication or autonomous moderation.

## Privacy and data handling

At webhook ingress, only eligible text is retained for C1: explicit commands,
exact bot mentions in active communities, allowed replies, and text from selected
Q&A topics. All other ordinary chatter is recorded only as an update ID.

At most three previous Q&A pairs can be reused, always limited to the same
community ID, forum topic ID, and unexpired retention period. Private chats
and other communities are never accessed. Configurable retention is 0–30 days;
zero disables history and interaction persistence.

Rate controls: one answer per user per configured cooldown; 15 group answers
per minute; configured hourly replies per group; configured daily AI budget.
Requests blocked by a rate limit are silent; failed attempts may count toward
the conservative budget.

## Release and security gates

C1 changes MODULE_RUNTIME_RELEASED.assistant to true in code, but
ISNAD_COMMUNITY_ENABLED defaults off. Communities still need verified admin
claim and activation. Group pause and global pause override everything.
All other module runtime flags remain false.

Set TELEGRAM_BOT_USERNAME to the actual bot username for reliable ingress
mention matching. Requires C0 database migration 006, valid webhook auth,
durable inbox draining, monitoring, a restore drill, and live Telegram staging.

No C1 migration: reuse community_interactions and community_settings from C0.

## Test plan

- Unit: no ambient responses; mention and ask; other-bot commands ignored;
  exact mention; optional topic and reply modes; retention filters.
- PostgreSQL: cross-community and private-chat isolation, answer persistence,
  topic scoping, pause, limits, and permission demotion.
- Telegram staging: normal group, forum supergroup, channel, bot removal,
  edits, duplicate updates, invalid permissions and rates.
- Gates: npm run typecheck; npm test; npm run test:db; npm run build;
  changed-file eslint; mobile Mini App review.

Do not claim unexecuted checks pass. All results are required before approval.

## Rollback

Revert C1 if ever merged, or disable ISNAD_COMMUNITY_ENABLED.
C1 adds no schema changes. The global pause remains available.

## Next sprint

C2 — Content Verification remains unreleased until the source-audit and
false-attribution release gates pass.
