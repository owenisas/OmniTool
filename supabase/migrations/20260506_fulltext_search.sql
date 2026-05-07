-- Full-text search for notes: generated tsvector column + GIN index
--
-- Title matches get weight 'A' (highest), body matches get weight 'B'.
-- The column is GENERATED ALWAYS STORED so it stays in sync with title/contentText
-- automatically on every INSERT/UPDATE -- no trigger maintenance needed.
--
-- Query with: WHERE search_vector @@ websearch_to_tsquery('english', $1)
-- Rank with:  ts_rank(search_vector, websearch_to_tsquery('english', $1))

ALTER TABLE notes ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce("contentText", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON notes USING GIN (search_vector);
