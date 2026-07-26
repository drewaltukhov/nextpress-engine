-- Per-post "Featured" flag. Newspaper hero/featured-card widgets prefer a
-- flagged post for the lead slot over the most-recent fallback. Stored as 0/1
-- in SQLite (Drizzle `{ mode: "boolean" }`); the Postgres facade coerces the
-- 0/1 literals via BOOLEAN_COLUMNS. Default 0 keeps every existing post
-- non-featured so the newspaper ordering is unchanged until a post opts in.

ALTER TABLE posts ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;
