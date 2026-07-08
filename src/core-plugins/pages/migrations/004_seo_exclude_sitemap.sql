-- Per-page opt-out from /sitemap.xml.
--
-- Default 0 (= included) preserves existing behaviour. When set to 1,
-- the row is dropped from the sitemap regardless of `seo.sitemap_include`
-- — the toggle is a per-row override on top of the site-wide include.
-- Useful for landing pages that exist for paid traffic only, internal
-- legal copy, etc.

ALTER TABLE pages ADD COLUMN seo_exclude_from_sitemap INTEGER NOT NULL DEFAULT 0;
