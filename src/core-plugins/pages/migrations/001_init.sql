CREATE TABLE IF NOT EXISTS `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content_json` text,
	`excerpt` text,
	`status` text NOT NULL DEFAULT 'draft',
	`published_at` text,
	`seo_title` text,
	`seo_description` text,
	`seo_og_image` text,
	`seo_canonical` text,
	`seo_robots` text NOT NULL DEFAULT 'index,follow',
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT `pages_status_check` CHECK (`status` IN ('draft','published')),
	CONSTRAINT `pages_robots_check` CHECK (`seo_robots` IN ('index,follow','noindex,follow','index,nofollow','noindex,nofollow')),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `pages_slug_unique` ON `pages` (`tenant_id`,`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pages_status_updated_idx` ON `pages` (`tenant_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pages_author_idx` ON `pages` (`tenant_id`,`created_by`);
