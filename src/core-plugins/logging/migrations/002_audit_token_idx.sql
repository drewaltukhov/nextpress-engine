CREATE INDEX IF NOT EXISTS `audit_log_token_idx` ON `audit_log` (`actor_token_id`,`created_at`) WHERE "audit_log"."actor_token_id" IS NOT NULL;
