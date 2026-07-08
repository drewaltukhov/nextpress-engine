-- Mega-menu plugin pivot: replace freeform puck_data with a layout
-- registry. Each panel now picks a layout id + carries that layout's
-- config + a width preference. Mirrors libSQL migration
-- src/core-plugins/mega-menu/migrations/002_layout_schema.sql.
--
-- Idempotent so this can re-run cleanly on a Supabase install where
-- the libSQL-on-PG facade already applied 002_layout_schema.sql (the
-- plugin migration directly). Same shape either way; this one just
-- catches the migrate-pg path so the entry is recorded.

ALTER TABLE "menu_item_mega_panels" ADD COLUMN IF NOT EXISTS "layout_id" text DEFAULT 'editorial' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item_mega_panels" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item_mega_panels" ADD COLUMN IF NOT EXISTS "width_mode" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item_mega_panels" DROP COLUMN IF EXISTS "puck_data";
