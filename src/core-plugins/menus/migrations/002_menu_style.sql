-- Adds a global per-menu render style:
--   'top-level-only' — only roots are shown (children are hidden); no chevrons.
--   'dropdowns'      — current default; roots show submenus on hover.
--   'mega'           — opt-in to the mega-menu plugin's panels per top-level
--                      item (existing behavior when any panel is saved).
--
-- Defaults to 'dropdowns' so existing menus preserve the prior render
-- behavior without needing a per-row backfill. Bare identifiers (no
-- backticks, no double quotes) so the same statement parses on both
-- SQLite (libSQL) and Postgres.

ALTER TABLE menus ADD COLUMN style text NOT NULL DEFAULT 'dropdowns';
