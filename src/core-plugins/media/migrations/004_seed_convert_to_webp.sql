-- Seed the media.convert_to_webp toggle (default ON). Idempotent so existing
-- installs that already saved the setting via the admin UI keep their value.
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'media.convert_to_webp', 'true', 1, 'private', 0);
