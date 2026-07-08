-- src/core-plugins/themes/migrations/002_custom_templates.sql
-- Adds two nullable TEXT columns to theme_data so custom template rows
-- can record their parent template (for clone relationship) and their
-- display name (user-entered label; slug is the stable identity).
-- Existing rows (all built-ins) get NULL for both columns automatically.

ALTER TABLE theme_data ADD COLUMN parent_template TEXT;
ALTER TABLE theme_data ADD COLUMN display_name TEXT;
CREATE INDEX IF NOT EXISTS theme_data_theme_parent_idx
  ON theme_data(theme_slug, parent_template);
