CREATE TABLE IF NOT EXISTS `blocked_ips` (
	`ip_address` text NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`blocked_until` text,
	`blocked_by` text,
	`attempt_count` integer,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (`ip_address`, `tenant_id`),
	CONSTRAINT "blocked_ips_reason_check" CHECK("blocked_ips"."reason" IN ('auto:brute_force','auto:scanner','manual','admin_blocked')),
	FOREIGN KEY (`blocked_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `blocked_ips_active_idx` ON `blocked_ips` (`tenant_id`,`ip_address`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `allowed_ips` (
	`ip_cidr` text NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`label` text NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (`ip_cidr`, `tenant_id`),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
