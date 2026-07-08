-- Default site_settings rows — applied once after the table exists (001_init.sql).
-- Uses INSERT OR IGNORE so re-running is safe if migrations_log is ever reset.
--
-- To add new defaults as features land: create a NEW migration file
-- (e.g. 003_seed_xyz.sql). Never edit this file after it has been applied —
-- the migration runner's checksum verification would flag it as drift.

INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  (1, 'site.title',            '"NextPress"', 1, 'public',  0),
  (1, 'site.tagline',          '""',          1, 'public',  0),
  (1, 'site.url',              '""',          1, 'public',  0),
  (1, 'site.timezone',         '"UTC"',       1, 'public',  0),
  (1, 'smtp.host',             '""',          0, 'private', 0),
  (1, 'smtp.port',             '587',         0, 'private', 0),
  (1, 'smtp.user',             '""',          0, 'private', 0),
  (1, 'smtp.password',         '""',          0, 'private', 1),
  (1, 'smtp.from_address',     '""',          0, 'private', 0),
  (1, 'system.setup_complete', 'false',       1, 'private', 0);
