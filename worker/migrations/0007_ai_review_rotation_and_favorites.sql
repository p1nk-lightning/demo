ALTER TABLE content_articles ADD COLUMN ai_review_json TEXT;
ALTER TABLE content_articles ADD COLUMN ai_reviewed_at INTEGER;
ALTER TABLE content_articles ADD COLUMN ai_review_model TEXT;

CREATE INDEX IF NOT EXISTS idx_content_articles_rotation
ON content_articles(status, difficulty, published_at, created_at);

CREATE TABLE IF NOT EXISTS user_content_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES content_articles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_content_favorites_user_date
ON user_content_favorites(user_id, created_at DESC);
