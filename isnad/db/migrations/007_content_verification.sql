-- ISN-C2A: Content Verification evidence foundation.
-- Additive migration only. No religious source content is seeded or auto-approved.
-- This schema distinguishes text matching, attribution, grading, and scholarly review.

CREATE TABLE IF NOT EXISTS source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('quran', 'hadith', 'scholarship')),
  work TEXT NOT NULL CHECK (length(trim(work)) > 0),
  locator TEXT NOT NULL CHECK (length(trim(locator)) > 0),
  edition TEXT NOT NULL,
  canonical_text TEXT NOT NULL CHECK (length(trim(canonical_text)) >= 10),
  language TEXT NOT NULL CHECK (language IN ('ar', 'en')),
  source_version TEXT NOT NULL,
  source_url TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  license_notice TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'revoked')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (review_status <> 'approved' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
  UNIQUE (source_type, work, locator, edition, language, source_version)
);

CREATE INDEX IF NOT EXISTS source_records_approved_lookup_idx
  ON source_records (source_type, work, locator) WHERE review_status = 'approved';

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  requester_telegram_user_id BIGINT NOT NULL,
  telegram_message_id BIGINT,
  thread_id BIGINT,
  submission_text TEXT NOT NULL CHECK (length(trim(submission_text)) BETWEEN 10 AND 2500),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'inconclusive', 'text_matched', 'needs_review', 'error')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS verification_requests_scope_idx
  ON verification_requests (community_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS verification_requests_expiry_idx
  ON verification_requests (expires_at);

CREATE TABLE IF NOT EXISTS verification_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  source_record_id UUID REFERENCES source_records(id) ON DELETE RESTRICT,
  text_match_status TEXT NOT NULL CHECK (text_match_status IN ('exact', 'partial', 'no_match')),
  attribution_status TEXT NOT NULL DEFAULT 'not_assessed'
    CHECK (attribution_status IN ('not_assessed', 'attributed', 'disputed')),
  grading_status TEXT NOT NULL DEFAULT 'not_assessed'
    CHECK (grading_status IN ('not_assessed', 'recorded', 'disputed')),
  outcome_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, source_record_id)
);

-- Source records require explicit human review, and match status alone never
-- authenticates an attribution or establishes a hadith grading.
