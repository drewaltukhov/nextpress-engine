CREATE TABLE IF NOT EXISTS `system_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`event` text NOT NULL,
	`message` text NOT NULL,
	`context` text DEFAULT ('{}') NOT NULL,
	`trace_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "system_log_level_check" CHECK("system_log"."level" IN ('debug','info','warn','error'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_log_recent_idx` ON `system_log` (`tenant_id`,`level`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_log_source_idx` ON `system_log` (`source`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_log_trace_idx` ON `system_log` (`trace_id`) WHERE "system_log"."trace_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `failed_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`job_type` text NOT NULL,
	`payload` text DEFAULT ('{}') NOT NULL,
	`error_message` text NOT NULL,
	`error_stack` text,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`next_retry_at` text,
	`resolved_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `failed_jobs_pending_idx` ON `failed_jobs` (`next_retry_at`) WHERE "failed_jobs"."resolved_at" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `failed_logins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`email` text,
	`ip_address` text NOT NULL,
	`reason` text NOT NULL,
	`geo` text DEFAULT ('{}') NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `failed_logins_ip_idx` ON `failed_logins` (`ip_address`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `failed_logins_email_idx` ON `failed_logins` (`email`,`created_at`) WHERE "failed_logins"."email" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`actor_user_id` text,
	`actor_token_id` integer,
	`session_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`diff` text,
	`diff_size_bytes` integer,
	`diff_truncated` integer DEFAULT false NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`trace_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_actor_idx` ON `audit_log` (`tenant_id`,`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_action_idx` ON `audit_log` (`tenant_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_target_idx` ON `audit_log` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_session_idx` ON `audit_log` (`session_id`,`created_at`) WHERE "audit_log"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `plugin_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plugin_slug` text NOT NULL,
	`phase` text NOT NULL,
	`hook_name` text,
	`error_message` text NOT NULL,
	`error_class` text,
	`error_stack` text,
	`context` text DEFAULT ('{}') NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "plugin_failures_phase_check" CHECK("plugin_failures"."phase" IN ('boot','migrate','register','hook','route'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `plugin_failures_recent_idx` ON `plugin_failures` (`plugin_slug`,`created_at`);