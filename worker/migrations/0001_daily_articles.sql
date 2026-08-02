CREATE TABLE IF NOT EXISTS daily_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('CET4', 'CET6', '考研', '雅思', '托福')),
  topic TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  cover_url TEXT,
  publish_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_articles_date_level
ON daily_articles(publish_date, difficulty);

CREATE INDEX IF NOT EXISTS idx_daily_articles_published
ON daily_articles(publish_date DESC);
