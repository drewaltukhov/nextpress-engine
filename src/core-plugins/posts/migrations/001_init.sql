-- Posts plugin: blog-style content with pillar/spike taxonomy.
--
-- Mirrors the `pages` table layout (Puck content_json, SEO fields,
-- schema_types, soft-delete trash, etc.) with three additions specific
-- to Posts:
--
--   1. featured_image — a media URL chosen via MediaPickerInput,
--      doubles as the og:image fallback when seo_og_image is unset.
--   2. post_kind — 'standalone' | 'pillar' | 'spike'. Pillars are broad-
--      authority hubs; spikes are narrow long-tail pages that hang off
--      a pillar via parent_id. Standalone is everything else.
--   3. parent_id — self-FK, only meaningful when post_kind='spike'. The
--      service layer enforces "parent must be a pillar" and clears the
--      column on any non-spike row.
--
-- Public URLs:
--   - Pillars + standalone: /<slug>  (share the global slug namespace
--     with pages + topics via reserved_slugs)
--   - Spikes: /<pillar.slug>/<slug> (slug only needs to be unique among
--     siblings under the same pillar)
--
-- That URL split drives the partial unique indexes below.

CREATE TABLE IF NOT EXISTS `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content_json` text,
	`excerpt` text,
	`featured_image` text,
	`status` text NOT NULL DEFAULT 'draft',
	`published_at` text,
	`post_kind` text NOT NULL DEFAULT 'standalone',
	`parent_id` integer,
	`seo_title` text,
	`seo_description` text,
	`seo_og_image` text,
	`seo_canonical` text,
	`seo_robots` text NOT NULL DEFAULT 'index,follow',
	`schema_types` text NOT NULL DEFAULT '[]',
	`trashed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT `posts_status_check` CHECK (`status` IN ('draft','published')),
	CONSTRAINT `posts_kind_check` CHECK (`post_kind` IN ('standalone','pillar','spike')),
	CONSTRAINT `posts_robots_check` CHECK (`seo_robots` IN ('index,follow','noindex,follow','index,nofollow','noindex,nofollow')),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
--> statement-breakpoint
-- Slug uniqueness scoped to the URL shape:
--   * Root-level rows (pillars + standalone) share the global /<slug>
--     namespace and must be unique within the tenant.
--   * Spike rows live under a pillar; only need slug uniqueness among
--     siblings of the same parent.
-- Both indexes exclude trashed rows so a slug is freed for reuse the
-- moment its row is trashed (matches the pages_slug_unique pattern).
CREATE UNIQUE INDEX IF NOT EXISTS `posts_slug_root_unique`
  ON `posts` (`tenant_id`,`slug`)
  WHERE `trashed_at` IS NULL AND `parent_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `posts_slug_child_unique`
  ON `posts` (`tenant_id`,`parent_id`,`slug`)
  WHERE `trashed_at` IS NULL AND `parent_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_status_updated_idx` ON `posts` (`tenant_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_author_idx` ON `posts` (`tenant_id`,`created_by`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_parent_idx` ON `posts` (`tenant_id`,`parent_id`) WHERE `parent_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_kind_idx` ON `posts` (`tenant_id`,`post_kind`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_trashed_idx` ON `posts` (`tenant_id`,`trashed_at`) WHERE `trashed_at` IS NOT NULL;
--> statement-breakpoint
-- Posts ↔ Topics many-to-many. Topics already exist as a plugin; this
-- join lives in the posts plugin since it owns the relationship lifecycle
-- (created on assign, dropped on post trash via CASCADE).
CREATE TABLE IF NOT EXISTS `posts_topics` (
	`post_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY (`post_id`,`topic_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_topics_topic_idx` ON `posts_topics` (`topic_id`);
