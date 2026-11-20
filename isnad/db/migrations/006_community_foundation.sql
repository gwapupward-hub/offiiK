-- ISN-C0: Secure Community Foundation.
-- Additive only: no existing table, column, or constraint is altered or dropped.
-- Rollback: see docs/community/c0-foundation.md ("Migration and rollback").

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('group', 'supergroup', 'channel')),
  title TEXT NOT NULL DEFAULT '',
  is_forum BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'permission_lost', 'removed')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  -- Telegram user who added the bot (from my_chat_member). A hint for the
  -- setup flow only; it never grants authority on its own.
  installed_by_telegram_user_id BIGINT,
  bot_status TEXT NOT NULL DEFAULT 'unknown',
  bot_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  bot_permissions_checked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paused_at TIMESTAMPTZ,
  paused_by UUID REFERENCES users(id) ON DELETE SET NULL,
  pause_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communities_pending_installer_idx
  ON communities(installed_by_telegram_user_id)
  WHERE status = 'pending';

-- Application-level roles. A row here is a delegation, never proof of current
-- Telegram authority: every privileged operation re-checks getChatMember.
CREATE TABLE IF NOT EXISTS community_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN (
    'owner', 'community_manager', 'content_editor',
    'source_reviewer', 'publisher', 'analytics_viewer'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  last_verified_status TEXT,
  UNIQUE (community_id, telegram_user_id, role)
);

-- Exactly one active owner per community; makes concurrent claims safe.
CREATE UNIQUE INDEX IF NOT EXISTS community_memberships_single_owner_idx
  ON community_memberships(community_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS community_memberships_user_active_idx
  ON community_memberships(telegram_user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS community_settings (
  community_id UUID PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  assistant_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  publisher_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Community-scoped interaction records (used from C1). Never joined with the
-- private conversations/messages tables, and expire by default.
CREATE TABLE IF NOT EXISTS community_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  thread_id BIGINT,
  telegram_message_id BIGINT,
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS community_interactions_scope_idx
  ON community_interactions(community_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_interactions_expiry_idx
  ON community_interactions(expires_at);

-- Durable Telegram update inbox. "received" is the in-request state before the
-- row commits; persisted rows start at "pending".
CREATE TABLE IF NOT EXISTS telegram_inbox (
  update_id BIGINT PRIMARY KEY,
  update_kind TEXT NOT NULL,
  chat_id BIGINT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'retryable_failed', 'terminal_failed'
  )),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set before the first outbound side effect (e.g. an AI reply). A lease
  -- that expires after this point is never retried: outcome is unknown.
  side_effect_started_at TIMESTAMPTZ,
  last_error_code TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  payload_purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS telegram_inbox_ready_idx
  ON telegram_inbox(next_attempt_at)
  WHERE status IN ('pending', 'retryable_failed');

CREATE INDEX IF NOT EXISTS telegram_inbox_lease_idx
  ON telegram_inbox(lease_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS telegram_inbox_received_idx
  ON telegram_inbox(received_at);

-- Administrative audit trail. Summaries only; no raw message content.
-- No ON DELETE CASCADE: audit history must outlive configuration changes.
CREATE TABLE IF NOT EXISTS community_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_telegram_user_id BIGINT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_summary JSONB,
  after_summary JSONB,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_audit_events_community_created_idx
  ON community_audit_events(community_id, created_at DESC);

-- Short-lived setup links. Only a SHA-256 hash is stored, and each nonce is
-- bound to the administrator it was issued to.
CREATE TABLE IF NOT EXISTS community_setup_nonces (
  nonce_hash TEXT PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  issued_to_telegram_user_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_setup_nonces_expiry_idx
  ON community_setup_nonces(expires_at);

CREATE TABLE IF NOT EXISTS community_idempotency_keys (
  actor_telegram_user_id BIGINT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_telegram_user_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS community_idempotency_keys_created_idx
  ON community_idempotency_keys(created_at);
