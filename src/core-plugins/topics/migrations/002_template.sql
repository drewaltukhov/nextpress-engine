-- src/core-plugins/topics/migrations/002_template.sql
-- Lets a Topic opt into a user-defined custom Topic Archive template.
-- NULL = use the built-in `topic-archive` template (default behavior).
-- A non-NULL value is the slug of a custom theme_data row whose
-- parent_template = 'topic-archive'. We don't FK to theme_data because
-- the theme-template relationship is theme-scoped and the active theme
-- can change; `resolveTemplateData` in the themes service handles the
-- "custom row missing → fall back to parent built-in" case at render
-- time, so a dangling reference renders gracefully.

ALTER TABLE topics ADD COLUMN template TEXT;
