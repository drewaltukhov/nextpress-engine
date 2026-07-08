CREATE TABLE IF NOT EXISTS `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`post_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `topics_slug_unique` ON `topics` (`tenant_id`,`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `topics_name_idx` ON `topics` (`tenant_id`,`name`);
