-- Hand-authored (see 0001_grant_plugins_public.sql for the convention): keeps
-- the Postgres/Supabase schema in step with the posts plugin's SQLite migration
-- 004_featured.sql, which adds the `is_featured` flag. The runtime uses the
-- libSQL schema + the PG facade, but native Supabase projects provisioned from
-- the drizzle core-pg migrations need the column created as a real boolean.
--
-- Idempotent so re-running against an already-migrated database is a no-op.

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false NOT NULL;
