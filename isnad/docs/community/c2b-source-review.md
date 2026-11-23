# ISN-C2B — Reviewed Source Ingestion and Explicit /verify UX

Status: **draft implementation — no production merge or activation**
Dependency: C1 PR #42 → C2A PR #43 → this C2B branch.
Current target: `feature/isn-c2-evidence-foundation-20261123`.

## What is implemented

1. Source editors can submit a manual Qur'an, hadith or scholarly-text record with work, locator, edition, version, original wording, language, HTTPS URL (optional), rights statement and structured provenance.
2. A different source reviewer can approve or revoke a *specific* community-owned source. Approval is never automatic. Submission and review use the existing signed Telegram Mini App session, active per-community roles, and Telegram live status. The reviewer and submitter must be different user IDs. All transitions are logged in the existing community audit stream.
3. The Admin Control Center displays a **Sources** tab to editors/reviewers, with a reviewed-source queue and a guided manual submission form.
4. The C2 evidence matching engine is now **community-scoped**, preventing one community's approval from silently becoming evidence in another.
5. An explicit text-only `/verify text` command and `/verify` in reply to a text message are routed through the existing inbox with source-matching and reply/thread protection; all processing remains behind `MODULE_RUNTIME_RELEASED.verification = false`. As of this sprint the Telegram command is **not live**.
6. Source submissions and verification requests inherit C2A's 30-day request-expiry maintenance and separate assessment of text, attribution and grading.

## Critical limits

- **Text matching is not hadith authentication.** Even with a reviewed source, results may only say that an exact wording match was found or that verification is inconclusive. The product MUST NOT infer sanad grading, attribution or legal authority from a text match.
- Provenance and a rights statement are **submitted claims**. C2B does not validate third-party copyright permissions or confer scholarly qualifications. Human governance and a licensed corpus are still required.
- No external API ingestion, source scraping, automated grade generation, AI-reviewed approvals or copied copyrighted religious corpus.
- No content is seeded; all newly created records start `pending`.
- Revocation prevents future matching, but does not rewrite previously stored findings. C2C should add historical correction notices and revision/withdrawal workflows.
- Existing C2A uniqueness is by source locator and edition across the table; identical identifiers submitted by another community may cause a 409 pending a safely migrated community-specific uniqueness model. Do not imply unrestricted multi-community source imports.
- The new source APIs may be deployed only after all C1/C2A prerequisites are merged, migrations are applied and independently staged. As drafted, all branches remain unmerged.

## API surface

- `GET /api/v1/communities/:id/sources` — role-checked source queue.
- `POST /api/v1/communities/:id/sources` — editor submits source; idempotency key required.
- `POST /api/v1/communities/:id/sources/:sourceId/review` — reviewer approves or revokes; idempotency key required.
- All admin operations require authenticated Telegram Mini App initData, live community membership, Isnad role, per-user rate limiting and audit data without raw source passages.

## Security and testing

Acceptance scenarios:
- Missing/invalid Telegram identity and cross-community IDs rejected.
- Editor can submit but cannot approve.
- Reviewer cannot approve own submission.
- A source from community A cannot match or be reviewed for community B.
- A revoked/unreviewed passage is inconclusive; no automatic hadith grade.
- /verify is silent/inactive when its runtime gate is off.
- Bot pauses, rights loss, rate limits and topic IDs are honored.
- Database schema migration 008 supports source scope and independence.
- Typecheck, unit, PostgreSQL integration, build and changed-file lint must all pass on exact head commit.

**Remaining requirements:** independent staging bot and DB, real vetted and rights-cleared source corpus, review-policy ownership and authentication of reviewers, scholarly assessment/accuracy dataset, historical corrections, live Telegram staging, and explicit owner approval for merge and a separate approval for production activation.
