CREATE TABLE IF NOT EXISTS content_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,
  content_id INTEGER NOT NULL,
  snapshot   TEXT    NOT NULL,
  created_by TEXT,
  created_at TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_revisions_lookup_idx
  ON content_revisions (kind, content_id, created_at);
