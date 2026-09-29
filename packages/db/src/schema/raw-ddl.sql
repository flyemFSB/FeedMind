-- drizzle-kit 无法生成的幂等 DDL：FTS5 虚表，以及含表达式的索引
-- （drizzle-kit 会把 SQL 表达式按逗号拆成多个标识符，生成非法索引定义）

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
  space_id UNINDEXED,
  path UNINDEXED,
  raw_title UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_feed_item_timeline
  ON feed_item (coalesce(published_at, created_at), created_at);

CREATE INDEX IF NOT EXISTS idx_feed_item_source_timeline
  ON feed_item (source_id, coalesce(published_at, created_at));
