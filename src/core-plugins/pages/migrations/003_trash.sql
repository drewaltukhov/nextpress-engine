-- Soft-delete: pages move to trash (trashed_at = ISO timestamp) for 30
-- days before a separate cleanup job permanently deletes them. Trashed
-- rows are excluded from all reads except explicit trash queries.
--
-- The slug unique index becomes partial — it excludes trashed rows so
-- the slug is freed for reuse the moment a page is trashed (matches WP
-- behaviour). The new trashed_idx supports the cleanup job's "older
-- than N days" sweep without scanning the whole table.

ALTER TABLE pages ADD COLUMN trashed_at TEXT;
--> statement-breakpoint
DROP INDEX IF EXISTS pages_slug_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX pages_slug_unique ON pages (tenant_id, slug) WHERE trashed_at IS NULL;
--> statement-breakpoint
CREATE INDEX pages_trashed_idx ON pages (tenant_id, trashed_at) WHERE trashed_at IS NOT NULL;
