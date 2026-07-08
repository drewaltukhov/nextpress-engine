CREATE TABLE IF NOT EXISTS `api_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scopes` text DEFAULT ('[]') NOT NULL,
	`allowed_origins` text,
	`rate_limit_per_minute` integer,
	`expires_at` text,
	`last_used_at` text,
	`last_used_ip` text,
	`revoked_at` text,
	`revoked_by` text,
	`revoked_reason` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `api_tokens_hash_unique` ON `api_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_tokens_active_idx` ON `api_tokens` (`token_hash`) WHERE "api_tokens"."revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_tokens_user_idx` ON `api_tokens` (`user_id`,`tenant_id`);
