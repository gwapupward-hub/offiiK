CREATE TABLE IF NOT EXISTS bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bookmark_collections_user_name_idx
  ON bookmark_collections(user_id, lower(name));

CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES bookmark_collections(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN ('ai_response', 'quran', 'hadith', 'tafsir', 'research', 'arabic', 'other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookmarks_user_updated_idx
  ON bookmarks(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS bookmarks_collection_updated_idx
  ON bookmarks(collection_id, updated_at DESC)
  WHERE collection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_message_idx
  ON bookmarks(user_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES bookmark_collections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_notes_user_updated_idx
  ON study_notes(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS study_notes_collection_updated_idx
  ON study_notes(collection_id, updated_at DESC)
  WHERE collection_id IS NOT NULL;
