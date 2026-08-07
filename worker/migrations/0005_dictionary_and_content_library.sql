CREATE TABLE IF NOT EXISTS dictionaries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  license TEXT NOT NULL,
  source_url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dictionary_entries (
  dictionary_id TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
  normalized TEXT NOT NULL,
  headword TEXT NOT NULL,
  phonetic TEXT,
  part_of_speech TEXT,
  definition_en TEXT,
  definition_zh TEXT,
  example_en TEXT,
  difficulty TEXT CHECK (difficulty IN ('CET4', 'CET6', '考研', '雅思', '托福')),
  frequency_rank INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dictionary_id, normalized)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_entries_normalized
ON dictionary_entries(normalized, dictionary_id);

CREATE TABLE IF NOT EXISTS content_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  homepage_url TEXT NOT NULL,
  license_note TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('CET4', 'CET6', '考研', '雅思', '托福')),
  topic TEXT NOT NULL CHECK (topic IN ('随机', '科技', '文化', '教育', '生活', '商业', '自然')),
  word_count INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES content_sources(id),
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published_at TEXT,
  license_note TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'published', 'archived')),
  publish_date TEXT,
  cover_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_content_articles_status_level
ON content_articles(status, difficulty, topic, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_articles_source
ON content_articles(source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_content_views (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES content_articles(id) ON DELETE CASCADE,
  first_viewed_at INTEGER NOT NULL,
  last_viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_content_views_user_date
ON user_content_views(user_id, last_viewed_at DESC);

INSERT OR IGNORE INTO dictionaries (id, name, description, license, source_url, priority, updated_at)
VALUES
  ('ecdict-en-zh', 'ECDICT 英汉词典', '英汉释义、音标、词性和常用词频的内置词典。', 'MIT License, Copyright (c) 2025 Linwei', 'https://github.com/skywind3000/ECDICT', 10, unixepoch() * 1000),
  ('lexiscene-core', 'LexiScene 学习核心词索引', '从 ECDICT 清洗出的高频学习词层，用于难度和文章词汇命中。', 'Derived from ECDICT under MIT License', 'https://github.com/skywind3000/ECDICT', 5, unixepoch() * 1000);

INSERT OR IGNORE INTO content_sources (id, name, feed_url, homepage_url, license_note, updated_at)
VALUES
  ('bbc-news', 'BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 'https://www.bbc.com/news', '仅使用公开 RSS 的标题、摘要和链接作为事实线索；文章正文为原创改写。', unixepoch() * 1000),
  ('nasa', 'NASA', 'https://www.nasa.gov/rss/dyn/breaking_news.rss', 'https://www.nasa.gov/', 'NASA 公开资料，具体页面按来源链接标注；文章正文为学习用途原创改写。', unixepoch() * 1000),
  ('un-news', 'UN News', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'https://news.un.org/', '仅使用公开 RSS 的标题、摘要和链接作为事实线索；文章正文为原创改写。', unixepoch() * 1000);
