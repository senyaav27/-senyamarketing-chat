CREATE TABLE IF NOT EXISTS conversations (
 id BIGSERIAL PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
 page TEXT NOT NULL, utm JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id BIGSERIAL PRIMARY KEY, conversation_id BIGINT NOT NULL REFERENCES conversations ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('visitor','owner','contact')), text TEXT NOT NULL,
 client_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(conversation_id,client_id)
);
CREATE TABLE IF NOT EXISTS form_leads (
 id BIGSERIAL PRIMARY KEY, dedup_key TEXT UNIQUE NOT NULL, payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
 id BIGSERIAL PRIMARY KEY, message_id BIGINT UNIQUE REFERENCES messages ON DELETE CASCADE,
 form_id BIGINT UNIQUE REFERENCES form_leads ON DELETE CASCADE,
 chat_id TEXT NOT NULL, payload JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 next_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(next_at) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS telegram_links (
 chat_id TEXT NOT NULL, telegram_message_id BIGINT NOT NULL,
 conversation_id BIGINT NOT NULL REFERENCES conversations ON DELETE CASCADE,
 PRIMARY KEY(chat_id,telegram_message_id)
);
CREATE TABLE IF NOT EXISTS telegram_updates (id BIGINT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS conversation_activity ON conversations(updated_at);
