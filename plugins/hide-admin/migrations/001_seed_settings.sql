-- Hide Admin plugin default settings
INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'hide-admin.path', '""', 1, 'private', 0);
