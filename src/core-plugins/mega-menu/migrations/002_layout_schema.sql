-- Pivot to a layout registry: each panel picks one of N pre-built React
-- layouts and stores its config + width preference instead of a freeform
-- Puck data tree. The table key (menu_item_id) is unchanged.

ALTER TABLE `menu_item_mega_panels` ADD COLUMN `layout_id` text NOT NULL DEFAULT 'editorial';
--> statement-breakpoint
ALTER TABLE `menu_item_mega_panels` ADD COLUMN `config` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `menu_item_mega_panels` ADD COLUMN `width_mode` text NOT NULL DEFAULT 'full';
--> statement-breakpoint
-- libSQL/SQLite supports DROP COLUMN since 3.35; the existing puck_data
-- column has no callers post-pivot, so we drop it to keep the row narrow.
ALTER TABLE `menu_item_mega_panels` DROP COLUMN `puck_data`;
