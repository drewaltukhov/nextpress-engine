-- src/core-plugins/pages/migrations/005_template.sql
-- Lets a page opt into a user-defined custom template.
-- NULL = use the built-in `single-page` template.
-- Non-NULL = slug of a custom theme_data row whose parent_template
-- = 'single-page'. No FK — the active theme can change and
-- `resolveTemplateData` in the themes service falls back to the
-- parent's built-in row when a custom is missing, so a dangling
-- reference renders gracefully.

ALTER TABLE pages ADD COLUMN template TEXT;
