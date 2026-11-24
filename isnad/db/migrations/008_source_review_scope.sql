-- ISN-C2B: isolate source evidence by Telegram community and its submitting editor.
-- All new approvals must be owned by a community and have a different reviewer.
-- No data is imported or approved by this migration.
ALTER TABLE source_records
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE;
ALTER TABLE source_records
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS source_records_community_review_idx
  ON source_records (community_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS source_records_community_text_idx
  ON source_records (community_id, normalized_text)
  WHERE review_status = 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'source_records_reviewer_separation'
  ) THEN
    ALTER TABLE source_records
      ADD CONSTRAINT source_records_reviewer_separation
      CHECK (review_status <> 'approved' OR (
        community_id IS NOT NULL
        AND submitted_by IS NOT NULL
        AND reviewed_by IS DISTINCT FROM submitted_by
      ));
  END IF;
END
$$;
