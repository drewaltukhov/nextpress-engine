-- Google News: optional language override.
-- Empty string = "Auto / use the country's default language".
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'google-news.language', '""', 1, 'private', 0);
