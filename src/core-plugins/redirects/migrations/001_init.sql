CREATE TABLE IF NOT EXISTS `redirects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`status` integer DEFAULT 301 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`last_hit_at` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text,
	`notes` text,
	CONSTRAINT "redirects_status_check" CHECK("redirects"."status" IN (301, 302, 307, 308, 410)),
	CONSTRAINT "redirects_source_check" CHECK("redirects"."source" IN ('manual','permalink_change','slug_change','media_rename')),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `redirects_path_unique` ON `redirects` (`tenant_id`,`from_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `redirects_active_idx` ON `redirects` (`tenant_id`,`from_path`) WHERE "redirects"."active" = 1;
