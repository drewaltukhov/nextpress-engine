-- Per-post opt-out from /sitemap.xml — same behaviour as the pages
-- equivalent (see pages/migrations/004). Default 0 keeps existing rows
-- in the sitemap; flipping to 1 drops the row regardless of the
-- site-wide `seo.sitemap_include.posts` toggle.

ALTER TABLE posts ADD COLUMN seo_exclude_from_sitemap INTEGER NOT NULL DEFAULT 0;
