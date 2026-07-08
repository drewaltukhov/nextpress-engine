import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";

/**
 * Reset the setup wizard state for development testing.
 *
 * Wipes all users and flips system.setup_complete back to false.
 * Works against any libSQL URL — local file, Turso, or in-memory —
 * unlike the previous sqlite3-CLI shell version.
 *
 * After running, restart the dev server and navigate to /admin —
 * the middleware reads the DB directly, so the wizard will appear
 * without any browser cleanup.
 */
async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });

  console.log(`Resetting setup state on: ${env.databaseUrl}`);

  // Mirrors the in-app /admin/reset action — wipe every user-data table
  // back to its post-migration empty state. Skipped intentionally:
  // migrations_log + migration_lock (schema state), roles +
  // reserved_slugs (seeded config), plugins (registry — boot rediscovers).
  await db.batch(
    [
      "DELETE FROM user_email_tokens",
      "DELETE FROM user_email_changes",
      "DELETE FROM user_oauth_accounts",
      "DELETE FROM user_roles",
      "DELETE FROM user_credentials",
      "DELETE FROM session_revocations",
      "DELETE FROM failed_logins",
      "DELETE FROM users",
      "DELETE FROM media",
      "DELETE FROM redirects",
      "DELETE FROM api_tokens",
      "DELETE FROM audit_log",
      "DELETE FROM system_log",
      "DELETE FROM plugin_failures",
      "DELETE FROM failed_jobs",
      "DELETE FROM backups",
      "DELETE FROM allowed_ips",
      "DELETE FROM blocked_ips",
      "UPDATE site_settings SET value = 'false' WHERE key = 'system.setup_complete' AND tenant_id = 1",
      "DELETE FROM site_settings WHERE tenant_id = 1 AND key LIKE 'smtp.%'",
      "DELETE FROM site_settings WHERE tenant_id = 1 AND key IN ('site.title','site.tagline','site.url','site.timezone')"
    ],
    "write"
  );

  console.log("Setup reset complete.");
  console.log("  - Users, sessions, media, redirects, api tokens, logs, IP lists wiped");
  console.log("  - system.setup_complete set to false");
  console.log("  - smtp.* and site.* settings wiped (will fall back to seed defaults)");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart the dev server: npm run dev");
  console.log("  2. Navigate to /admin — the setup wizard will appear");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
