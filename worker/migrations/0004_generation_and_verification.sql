ALTER TABLE articles ADD COLUMN provider TEXT;
ALTER TABLE articles ADD COLUMN model TEXT;

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens(user_id, created_at DESC);
CREATE INDEX idx_email_verification_tokens_expiry ON email_verification_tokens(expires_at);

CREATE TABLE generation_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('deepseek', 'qwen', 'doubao')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  article_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_generation_usage_user_day ON generation_usage(user_id, day_key, status);
CREATE INDEX idx_generation_usage_user_created ON generation_usage(user_id, created_at DESC);
