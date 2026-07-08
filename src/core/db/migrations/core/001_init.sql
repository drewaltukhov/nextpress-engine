CREATE TABLE IF NOT EXISTS `plugins` (
	`slug` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`settings` text DEFAULT ('{}') NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`installed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `migrations_log` (
	`plugin_slug` text NOT NULL,
	`migration_name` text NOT NULL,
	`applied_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`applied_by` text,
	`execution_ms` integer,
	`checksum` text NOT NULL,
	PRIMARY KEY(`plugin_slug`, `migration_name`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `migrations_log_applied_at_idx` ON `migrations_log` (`applied_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `migration_lock` (
	`id` integer PRIMARY KEY NOT NULL,
	`locked_at` text NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reserved_slugs` (
	`slug` text NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`reason` text NOT NULL,
	`added_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`tenant_id`, `slug`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reserved_slugs_source_idx` ON `reserved_slugs` (`source`);--> statement-breakpoint
-- Seed kernel reservations (per foundation §Slugs & URL Resolution)
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('_next',         1, 'core', 'Next.js runtime route prefix');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('static',        1, 'core', 'Next.js static asset prefix');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('public',        1, 'core', 'Next.js public asset prefix');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('favicon.ico',   1, 'core', 'Browser favicon path');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('admin',         1, 'core', 'Admin shell root');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('api',           1, 'core', 'API surface root');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('health',        1, 'core', 'Health check endpoint');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('p',             1, 'core', 'Plugin route catch-all prefix');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('sitemap.xml',   1, 'core', 'SEO — sitemap (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('sitemap',       1, 'core', 'SEO — sitemap (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('robots.txt',    1, 'core', 'SEO — robots (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('rss.xml',       1, 'core', 'SEO — RSS (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('rss',           1, 'core', 'SEO — RSS (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('feed',          1, 'core', 'SEO — RSS alias (essential tier)');--> statement-breakpoint
INSERT INTO reserved_slugs (slug, tenant_id, source, reason) VALUES ('manifest.json', 1, 'core', 'Web app manifest');
