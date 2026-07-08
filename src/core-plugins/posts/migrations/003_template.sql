-- src/core-plugins/posts/migrations/003_template.sql
-- Lets a post opt into a user-defined custom template.
-- NULL = use the built-in template for this kind:
--   standalone/spike → `single-post`
--   pillar           → `single-pillar`
-- Non-NULL = slug of a custom theme_data row whose parent_template
-- matches the post's kind. No FK to theme_data — the active theme can
-- change and `resolveTemplateData` in the themes service falls back to
-- the parent's built-in row when a custom is missing, so a dangling
-- reference renders gracefully.

ALTER TABLE posts ADD COLUMN template TEXT;
