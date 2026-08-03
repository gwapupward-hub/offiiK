ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_user_pinned_updated_idx
  ON conversations(user_id, pinned_at DESC, updated_at DESC)
  WHERE archived_at IS NULL;
