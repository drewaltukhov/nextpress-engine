CREATE TABLE IF NOT EXISTS `site_settings` (
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`autoload` integer DEFAULT false NOT NULL,
	`scope` text DEFAULT 'private' NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (`tenant_id`, `key`),
	CONSTRAINT "site_settings_scope_check" CHECK("site_settings"."scope" IN ('public','private')),
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `site_settings_autoload_idx` ON `site_settings` (`tenant_id`) WHERE "site_settings"."autoload" = 1;
