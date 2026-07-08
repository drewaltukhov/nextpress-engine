-- Weather plugin: location format + raw city parts
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'weather.location_format', '"city"',            1, 'private', 0),
  (1, 'weather.city_name',      '"New York"',         1, 'private', 0),
  (1, 'weather.state',          '"New York"',         1, 'private', 0),
  (1, 'weather.country',        '"United States"',    1, 'private', 0);
