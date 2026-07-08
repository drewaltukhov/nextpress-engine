-- Backup metadata — tracks when backups were created. The actual backup
-- files are downloaded immediately (no server-side storage in v1).
CREATE TABLE IF NOT EXISTS backups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  table_count   INTEGER NOT NULL,
  row_count     INTEGER NOT NULL,
  includes_logs INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS backups_tenant_idx ON backups (tenant_id, created_at DESC);
