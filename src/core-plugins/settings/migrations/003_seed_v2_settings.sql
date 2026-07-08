-- Default rows for the Phase 2 settings (date/time formats, security knobs,
-- API tuning, logging retention, maintenance mode). INSERT OR IGNORE keeps
-- pre-existing values untouched on already-deployed installs.

INSERT OR IGNORE INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
VALUES
  -- Site (date / time formatting)
  (1, 'site.date_format',                  '"MMM d, yyyy"',           1, 'public',  0),
  (1, 'site.time_format',                  '"12h"',                   1, 'public',  0),

  -- Security
  (1, 'security.lockout_threshold',        '5',                       1, 'private', 0),
  (1, 'security.lockout_window_minutes',   '15',                      1, 'private', 0),
  (1, 'security.lockout_duration_minutes', '30',                      1, 'private', 0),
  (1, 'security.session_max_age_days',     '30',                      1, 'private', 0),
  (1, 'security.step_up_ttl_minutes',      '5',                       1, 'private', 0),

  -- API
  (1, 'api.token_default_ttl_days',        '90',                      1, 'private', 0),
  (1, 'api.cors_allowed_origins',          '""',                      1, 'private', 0),
  (1, 'api.rate_limit_per_minute',         '60',                      1, 'private', 0),
  (1, 'api.log_token_introspection',       'false',                   1, 'private', 0),

  -- Logging
  (1, 'logging.audit_retention_days',      '365',                     1, 'private', 0),
  (1, 'logging.system_log_retention_days', '90',                      1, 'private', 0),
  (1, 'logging.failed_login_retention_days','180',                    1, 'private', 0),
  (1, 'logging.redaction_patterns',        '""',                      1, 'private', 0),
  (1, 'logging.log_successful_logins',     'true',                    1, 'private', 0),
  (1, 'logging.log_failed_logins',         'true',                    1, 'private', 0),

  -- Maintenance
  (1, 'maintenance.enabled',               'false',                   1, 'private', 0),
  (1, 'maintenance.message',               '"We''ll be back shortly."',1, 'private', 0),
  (1, 'maintenance.bypass_ips',            '""',                      1, 'private', 0),
  (1, 'maintenance.read_only',             'false',                   1, 'private', 0);
