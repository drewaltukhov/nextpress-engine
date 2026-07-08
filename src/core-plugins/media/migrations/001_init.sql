-- Media core-plugin — image library
-- DB-blob backend by default; storage_backend + storage_ref columns leave
-- room for plugin-supplied backends (e.g. plugin:vercel-blob) without a
-- schema migration. blob_data is NULL when bytes live elsewhere.

CREATE TABLE IF NOT EXISTS `media` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt_text` text,
	`blob_data` blob,
	`storage_backend` text DEFAULT 'db' NOT NULL,
	`storage_ref` text NOT NULL,
	`uploaded_by` text,
	`uploaded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_tenant_uploaded_idx` ON `media` (`tenant_id`, `uploaded_at` DESC) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_uploaded_by_idx` ON `media` (`uploaded_by`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint

-- Default settings
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'media.allowed_mime_types', '["image/jpeg","image/png","image/webp"]', 1, 'private', 0),
  (1, 'media.max_file_size_mb',   '5',                                       1, 'private', 0);
