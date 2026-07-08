-- Mega Menu plugin: per-item Puck panels attached to top-level menu items.
--
-- Authoring lives at /admin/menus/[menuId]/items/[itemId]/mega — a Puck
-- editor with a curated palette of existing engine blocks. Saved panels
-- appear as hover/focus dropdowns on the public site via NavMenu.
--
-- Storage shape: one row per (top-level) menu_item that has a panel.
-- Cascade-delete on the FK means panel rows disappear automatically when
-- their parent menu_items row is removed (which itself cascades from the
-- parent menu being deleted).

CREATE TABLE IF NOT EXISTS `menu_item_mega_panels` (
	`menu_item_id` integer PRIMARY KEY NOT NULL,
	`puck_data` text NOT NULL DEFAULT '{}',
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mega_panels_updated_idx` ON `menu_item_mega_panels` (`updated_at`);
