CREATE TABLE IF NOT EXISTS `galleries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`cover_media_id` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `galleries_slug_unique` ON `galleries` (`tenant_id`,`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `galleries_updated_idx` ON `galleries` (`tenant_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gallery_items` (
	`gallery_id` integer NOT NULL,
	`media_id` text NOT NULL,
	`position` integer NOT NULL,
	`caption` text,
	PRIMARY KEY (`gallery_id`,`media_id`),
	FOREIGN KEY (`gallery_id`) REFERENCES `galleries`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gallery_items_position_idx` ON `gallery_items` (`gallery_id`,`position`);
