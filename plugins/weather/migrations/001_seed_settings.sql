-- Weather plugin default settings
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'weather.city',         '"New York"',   1, 'private', 0),
  (1, 'weather.latitude',     '40.7128',      1, 'private', 0),
  (1, 'weather.longitude',    '-74.006',      1, 'private', 0),
  (1, 'weather.units',        '"fahrenheit"', 1, 'private', 0),
  (1, 'weather.show_icons',   'true',         1, 'private', 0),
  (1, 'weather.cached_data',  '""',           0, 'private', 0),
  (1, 'weather.last_fetched', '""',           0, 'private', 0);
