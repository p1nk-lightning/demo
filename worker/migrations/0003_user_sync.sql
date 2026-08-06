CREATE TABLE IF NOT EXISTS vocab_lists (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  mastered_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  schema_version INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS vocab_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT NOT NULL,
  mastered INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, list_id) REFERENCES vocab_lists(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS articles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  article TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  vocab_hit_ids_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  summary TEXT,
  topic TEXT,
  word_count INTEGER,
  estimated_minutes INTEGER,
  source TEXT,
  cover_url TEXT,
  publish_date TEXT,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_lists_user_updated ON vocab_lists(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_items_user_list ON vocab_items(user_id, list_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_user_created ON articles(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_user_updated ON reading_progress(user_id, updated_at DESC);
