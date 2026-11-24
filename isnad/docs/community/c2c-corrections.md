# ISN-C2C — Evidence Correction and Retraction Workflow

Status: **draft development**, no production activation or merge.
Base: merged C0+C1+C2A+C2B in `main` at `4374e232`.
Branch: `feature/isn-c2c-correction-workflows-20261123`.

## Why this sprint exists

The C2B reviewer could revoke a source to block future exact matches,
but findings issued *before* revocation had no review mechanism. Also,
the initial source natural key was unique globally, blocking unrelated
communities from submitting the same edition.

C2C corrects both issues without turning Isnad into an automated hadith
authenticator or making unsupervised corrective announcements.

## Functionality

1. Migration `009_verification_corrections.sql` safely creates a unique index
   scoped to `community_id` and a separate index for unscoped legacy records,
   then drops the obsolete global UNIQUE constraint. The operation is
   transactional in the existing migration runner.
2. Revoking a previously approved source requires an authenticated reviewer
   and a **10–500-character reason**. The existing row lock prevents competing
   review decisions.
3. Revocation creates one immutable `source_correction_events` record.
   All *unexpired* exact-match findings tied to that source and community
   become `verification_correction_notices` marked `needs_review`.
   Related `verification_requests` change to `needs_review`, while the
   original finding is preserved for inspection until its retention expires.
4. Reviewers see an **Internal correction queue** in the Sources tab and can
   acknowledge individual items. Acknowledgment is audited and does not claim
   the user was notified.
5. Request retention is still 30 days by default. Correction notices cascade
   when verification requests/findings expire. The correction event holds the
   minimal source ID, reviewer ID and reason, without copying user-submitted
   text into it.

## Security boundaries

- Per-community source and correction queries must not disclose records from
  other Telegram groups.
- Source approval cannot be granted by its original submitter; all reviewer
  actions additionally require signed Mini App identity and live Telegram
  membership with `content.review` capability.
- Source withdrawal blocks subsequent text matching, but does **not** establish
  that the underlying religious statement is false or fabricated.
- The `/verify` runtime stays **false**; no Telegram messages are sent by
  C2C correction workflows. A future correction-delivery pipeline requires
  explicit user/privacy rules, consent/legal review, delivery idempotency
  safeguards and owner approval.
- Changes to source attribution and grading remain a qualified scholarly
  responsibility, not an AI-generated verdict.

## Review and tests

- Migration 009: ordered application, repeatability, scoped uniqueness.
- Source review: approval → matched text → revocation → affected-finding queue
  → internal acknowledgment, plus invalid reason and duplicate transitions.
- Two communities can submit identical edition identifiers independently,
  but their review and correction queues remain isolated.
- All prior group and private mode regression tests must remain green.
- Required: TypeScript, unit suite, PostgreSQL integration, Next.js build,
  changed-file ESLint, reviewed UI Preview.
- Real Telegram staging and vetted religious sources remain release blockers.

## Deployment policy

The `main` branch is code-integrated but production deployment is held by
`isnad/vercel.json` (`git.deploymentEnabled.main = false`). Never remove
this gate, apply production migrations, change the Telegram webhook, or
enable `ISNAD_COMMUNITY_ENABLED` without separate owner approval and
evidence from an isolated staging bot/database.

No user-facing correction notices are delivered in this sprint.
