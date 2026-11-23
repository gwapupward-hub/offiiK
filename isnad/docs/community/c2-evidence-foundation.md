# ISN-C2A — Evidence foundation for Islamic Content Verification

**Status:** Implementation foundation; no live verification command or API has been enabled.
**Source branch:** `feature/isn-c2-evidence-foundation-20261123`
**Dependency:** C1 draft PR #42; C2A must remain based on C1 until C1 is accepted.
**Production:** NO merge, deployment, bot configuration, or feature flag activation.

## Core integrity principle

Verification of the **wording** of a source is different from verification of
the **attribution** of a report or the **grading** of its isnad. A text match is
never enough to call a hadith sahih, hasan, weak, or fabricated. Islamic scholarly
analysis must remain attributable to qualified source authorities.

The C2A engine supports **strict normalized-text matching** against records
explicitly approved by a human reviewer. Arabic diacritics and whitespace may
be normalized; different Arabic consonantal spellings, semantic paraphrases,
translation variants, and different editions must not be silently equated.

Results are limited to:

- `text_matched`: Wording matches a reviewer-approved source record. Not an
  authentication or jurisprudential ruling.
- `inconclusive`: The reviewed index has no exact text match. This does NOT
  mean the claim is false or fabricated.

No data is seeded or automatically marked `approved`. A fresh deployment
therefore yields only inconclusive results until a traceable, licensed, reviewed
corpus has been imported. Do not present it as a working hadith authentication
engine at this stage.

## Additive schema

Migration `007_content_verification.sql` adds:
- `source_records`: source type, work, locator, edition, language, exact text,
  normalized index, version, URL, provenance, license notice, and review state.
- `verification_requests`: community/thread-scoped submission, status and
  expiry (30 days default).
- `verification_findings`: text match, attribution, and grading statuses
  independently; defaults for attribution and grading are `not_assessed`.

A source cannot become approved without recorded reviewer identity and time;
revoked and pending records cannot satisfy lookup. The DB health check requires
migration 007. Existing migrations are not modified.

## Implementation included

- `verificationEvidence.ts`: pure normalization and conservative matching,
  DB-backed request/findings storage, and plain Telegram-safe summary renderer.
- Unit coverage for exact-vs-near match, invalid source status, diacritics,
  integrity of normalized indexes and false confidence.
- PostgreSQL tests for review constraints, stored findings, isolation and expiry.
- PR-only CI validation for TypeScript, unit tests, PostgreSQL integration,
  build and lint.

No Telegram /verify handler, new public API, editorial review UI or external
source import has been wired up. `MODULE_RUNTIME_RELEASED.verification`
remains **false**. C1 and private chat behavior are unchanged.

## C2B release work still required

1. Establish approved source providers, specific editions, copyright/license
   rules, citation locators and refresh/version strategy.
2. Build authenticated reviewer onboarding, role checks and an audit log for
   source ingestion/approval/revocation. Reviewer identity alone must not be
   treated as a universal scholarly license or as endorsement of a grading.
3. Implement the /verify reply-to-message UX (text only), with per-community
   budgets, deduplication, privacy retention and correct forum thread routing.
4. Add a review dashboard with clearly attributed grading, conflicting
   assessments and review escalation; no autonomous grade invention.
5. Extend source matching cautiously for translation differences and permitted
   short excerpts, always labeling reduced confidence and avoiding false
   authentication.
6. Add a validated test corpus of actual verified passages/gradings with
   provenance. No generated or guessed quotations are acceptable as fixtures.
7. Complete C1 live Telegram staging and isolate its staging bot/database.
8. Run C2 live staging and dedicated scholarly accuracy review.
9. Explicitly approve C2 runtime activation after all gates pass.

Quran Foundation offers source APIs, but API content, translations and derived
works have provider-specific licensing and attribution requirements. Do not
bundle or seed copyrighted texts from API responses into repository files.
Useful documentation: https://api-docs.quran.com/docs/api-reference/
and https://api-docs.quran.com/legal/developer-terms/

## Rollback

C2A adds only isolated tables and code. The runtime flag remains off. If
needed, revert the branch before merge; if ever merged later, retain tables
until retention and backup requirements for existing verification requests are
satisfied before applying any separate destructive migration.

## Exit criteria

- CI green on the exact C2A branch head.
- Schema ready and migration 007 independently idempotent.
- No false grading or authentication on unmatched, near-matched or unreviewed
  text.
- Private conversation and C1 community behavior regression suites pass.
- No live Telegram changes, and no production merge without a separate decision.
