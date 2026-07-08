-- Themes plugin: per-theme Puck data for shared parts + template inner
-- zones. The active-theme slug lives in the `settings` table under the
-- key `theme.active_slug`, NOT here — that key is namespaced like
-- everything else in settings, and reusing settings gives us audit log
-- + cache invalidation for free.
--
-- Each theme ships its own follow-up migration that `INSERT OR IGNORE`s
-- default rows for its parts + templates. The builder UPDATEs them.
-- "Reset to defaults" deletes the row(s) and re-runs the bundled
-- defaults from theme code.

CREATE TABLE IF NOT EXISTS `theme_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_slug` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`puck_data` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `theme_data_slug_kind_name_unique`
  ON `theme_data` (`theme_slug`, `kind`, `name`);
