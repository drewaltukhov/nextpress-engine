-- Seed the Pillar Template (single-pillar) row. Cloned from single-post
-- so a fresh install renders pillars with the same default layout
-- (featured image, title, meta, content) until the editor changes it.
--
-- INSERT OR IGNORE: re-running boot won't overwrite edits saved via
-- the theme builder.

INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'single-pillar',
  '{"content":[{"type":"PostFeaturedImage","props":{"id":"np-default-pillar-featured-1","rounded":true,"aspect":"original"}},{"type":"PostTitle","props":{"id":"np-default-pillar-title-1"}},{"type":"PostMeta","props":{"id":"np-default-pillar-meta-1","showAuthor":true,"nameSource":"displayName","authorPrefix":"By","linkAuthor":true,"showDate":true,"showTopics":true}},{"type":"PostContent","props":{"id":"np-default-pillar-content-1"}}],"root":{}}'
);
