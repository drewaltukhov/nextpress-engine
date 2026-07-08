-- Menus plugin: navigation menus + their items.
--
-- Themes' `<NavMenu location="primary" />` block looks up the menu whose
-- `location` matches and renders its items in tree order.
--
-- Items reference page/post/topic rows by id, or carry a custom URL.
-- The schema is permissive: `reference_id` is nullable (only meaningful
-- when item_type != 'custom'), `url` is nullable (only required when
-- item_type = 'custom' or used as override). The service layer enforces
-- the right combinations.

CREATE TABLE IF NOT EXISTS `menus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `menus_slug_unique` ON `menus` (`tenant_id`,`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `menus_location_idx` ON `menus` (`tenant_id`,`location`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `menu_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`menu_id` integer NOT NULL,
	`parent_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text NOT NULL,
	`item_type` text NOT NULL,
	`reference_id` integer,
	`url` text,
	`target` text DEFAULT '_self' NOT NULL,
	`css_classes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`menu_id`) REFERENCES `menus`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
	FOREIGN KEY (`parent_id`) REFERENCES `menu_items`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `menu_items_menu_idx` ON `menu_items` (`menu_id`,`position`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `menu_items_parent_idx` ON `menu_items` (`parent_id`,`position`);
