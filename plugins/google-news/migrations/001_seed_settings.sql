-- Google News plugin default settings
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'google-news.country',              '"US"', 1, 'private', 0),
  (1, 'google-news.refresh_interval_min', '15',   1, 'private', 0),
  (1, 'google-news.headline_count',       '10',   1, 'private', 0),
  (1, 'google-news.show_description',     'false',1, 'private', 0),
  (1, 'google-news.cached_data',          '""',   0, 'private', 0),
  (1, 'google-news.last_fetched',         '""',   0, 'private', 0);
