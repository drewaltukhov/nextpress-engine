-- Hand-authored: GRANT SELECT on plugins_public view to nextpress_public role.
-- Drizzle Kit manages schema (tables + view) but not role privileges, so role
-- GRANTs ship as hand-authored migrations alongside the generated ones.
--
-- This migration is idempotent: if the role doesn't exist yet (e.g., a fresh
-- Supabase project where bootstrap-supabase-roles.sql hasn't been run), the
-- GRANT will fail with a clear "role does not exist" error pointing the
-- operator at the bootstrap script. See docs/setup/supabase.md.

GRANT SELECT ON public.plugins_public TO nextpress_public;
