import { pgView, text, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Public-readable view exposing safe plugin columns only.
 * - Excludes `settings` (may contain PII / secrets) and `failure_count` (internal health).
 * - Filtered to enabled=true so callers can't enumerate disabled plugins.
 * - Granted SELECT to the `nextpress_public` Postgres role via migration 0004.
 */
export const pluginsPublic = pgView("plugins_public", {
  slug: text("slug").notNull(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull()
}).as(sql`SELECT slug, version, enabled FROM plugins WHERE enabled = true`);
