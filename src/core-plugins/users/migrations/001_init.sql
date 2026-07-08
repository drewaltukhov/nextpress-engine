CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`email` text NOT NULL,
	`email_verified_at` text,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`last_login_at` text,
	`lockout_until` text,
	`lockout_attempt_count` integer DEFAULT 0 NOT NULL,
	`meta` text DEFAULT ('{}') NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "users_status_check" CHECK("users"."status" IN ('active','invited','disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_tenant_email_unique` ON `users` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_active_idx` ON `users` (`tenant_id`,`email`) WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_locked_idx` ON `users` (`lockout_until`) WHERE "users"."lockout_until" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`algo` text DEFAULT 'argon2id' NOT NULL,
	`must_reset` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_oauth_accounts` (
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`profile` text DEFAULT ('{}') NOT NULL,
	`linked_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_seen_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_oauth_accounts_user_idx` ON `user_oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_email_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_email_tokens_purpose_check" CHECK("user_email_tokens"."purpose" IN ('verify_email','reset_password','invite'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_email_tokens_user_idx` ON `user_email_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_email_tokens_expires_idx` ON `user_email_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session_revocations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revoked_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_revocations_reason_check" CHECK("session_revocations"."reason" IN ('password_change','admin_disabled','suspicious_activity','manual','role_demotion'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roles` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`permissions` text DEFAULT ('[]') NOT NULL,
	`session_max_age_days` integer,
	`require_step_up` text DEFAULT ('[]') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_roles` (
	`user_id` text NOT NULL,
	`role_slug` text NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `role_slug`, `tenant_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_slug`) REFERENCES `roles`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_roles_role_idx` ON `user_roles` (`role_slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_roles_tenant_user_idx` ON `user_roles` (`tenant_id`,`user_id`);--> statement-breakpoint
-- Seed default roles (per foundation §Auth & Permissions § Default Roles)
INSERT INTO roles (slug, label, permissions, require_step_up) VALUES ('admin', 'Administrator', '["*"]', '["users.delete","plugins.disable","settings.security.update","api_tokens.create","cache.clear","reserved_slugs.add","reserved_slugs.remove"]');--> statement-breakpoint
INSERT INTO roles (slug, label, permissions, require_step_up) VALUES ('editor', 'Editor', '["posts.*","terms.*","media.*","topics.*","menus.*","forms.read","comments.moderate"]', '[]');--> statement-breakpoint
INSERT INTO roles (slug, label, permissions, require_step_up) VALUES ('author', 'Author', '["posts.create","posts.edit.own","posts.publish.own","media.upload"]', '[]');--> statement-breakpoint
INSERT INTO roles (slug, label, permissions, require_step_up) VALUES ('contributor', 'Contributor', '["posts.create","posts.edit.own"]', '[]');
