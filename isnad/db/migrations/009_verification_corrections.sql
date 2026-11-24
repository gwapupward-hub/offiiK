-- ISN-C2C: community-scoped evidence keys and correction review records.
-- No published Telegram messages, no religious source import, no content deletions.
--
-- Build community-specific uniqueness *before* removing the previous global key.
CREATE UNIQUE INDEX IF NOT EXISTS source_records_community_natural_key_idx
  ON source_records (community_id, source_type, work, locator, edition, language, source_version)
  WHERE community_id IS NOT NULL;

-- Legacy unscoped evidence remains unique until explicitly assigned to communities.
CREATE UNIQUE INDEX IF NOT EXISTS source_records_legacy_natural_key_idx
  ON source_records (source_type, work, locator, edition, language, source_version)
  WHERE community_id IS NULL;

DO $$
DECLARE old_unique TEXT;
BEGIN
  FOR old_unique IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'source_records'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) =
        'UNIQUE (source_type, work, locator, edition, language, source_version)'
  LOOP
    EXECUTE format('ALTER TABLE source_records DROP CONSTRAINT %I', old_unique);
  END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS source_correction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('revoked')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_record_id, event_type)
);

CREATE INDEX IF NOT EXISTS source_correction_events_community_idx
  ON source_correction_events (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_correction_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  correction_event_id UUID NOT NULL REFERENCES source_correction_events(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES verification_findings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'acknowledged')),
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status = 'needs_review' OR (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)),
  UNIQUE (correction_event_id, finding_id)
);

CREATE INDEX IF NOT EXISTS verification_correction_queue_idx
  ON verification_correction_notices (community_id, status, created_at DESC);

-- These notices are internal operator review items only.
-- No automatic Telegram follow-up is authorized in C2C.
