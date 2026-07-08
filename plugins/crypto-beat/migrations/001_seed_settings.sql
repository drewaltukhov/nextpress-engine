-- Crypto Beat plugin default settings
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'crypto-beat.api_key',              '""',   0, 'private', 0),
  (1, 'crypto-beat.assets',               '[]',   1, 'private', 0),
  (1, 'crypto-beat.currency',             '"usd"',1, 'private', 0),
  (1, 'crypto-beat.refresh_interval_min', '5',    1, 'private', 0),
  (1, 'crypto-beat.cached_data',          '""',   0, 'private', 0),
  (1, 'crypto-beat.last_fetched',         '""',   0, 'private', 0);
