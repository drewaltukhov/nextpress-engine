-- Mega-menu plugin: per-item Puck panel storage. Mirrors the libSQL
-- migration src/core-plugins/mega-menu/migrations/001_init.sql, which
-- runs on Supabase via the libSql-on-PG facade. Either path lands the
-- same table — keep this migration idempotent so re-runs on an
-- already-seeded DB skip cleanly instead of erroring out on a
-- duplicate CREATE TABLE.
--
-- Inline-FK form (instead of a separate ALTER TABLE ADD CONSTRAINT):
-- the migration runner splits statements on `;\n`, so a `DO $$ ... $$`
-- block to make the constraint idempotent breaks across statement
-- boundaries. Inlining the FK lets `CREATE TABLE IF NOT EXISTS` cover
-- both the table AND its constraint in a single statement.
--
-- Note: 0004_mega_panel_layout_columns.sql evolves this table into the
-- layout registry shape (drops puck_data, adds layout_id/config/
-- width_mode). Fresh installs flow 0003 → 0004; pre-seeded installs
-- (where the facade already applied 002_layout_schema.sql) skip both.

CREATE TABLE IF NOT EXISTS "menu_item_mega_panels" (
	"menu_item_id" integer PRIMARY KEY NOT NULL,
	"puck_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_mega_panels_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mega_panels_updated_idx" ON "menu_item_mega_panels" USING btree ("updated_at");
