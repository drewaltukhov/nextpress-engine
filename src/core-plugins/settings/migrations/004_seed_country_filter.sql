-- Default rows for the country-filter feature. INSERT OR IGNORE so existing
-- installs that already set values keep them.

INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'security.country_mode',  '"off"', 1, 'private', 0),
  (1, 'security.country_codes', '""',    1, 'private', 0);
