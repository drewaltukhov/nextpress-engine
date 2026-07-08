/**
 * Tables explicitly excluded from a demo snapshot.
 *
 * The new admin is created on top of the restored snapshot with a fresh UUID,
 * so demo credentials / tokens / sessions must never ride along. Logs and
 * operational state stay empty so the demo lands clean.
 *
 * `users` itself IS included so demo content's created_by / uploaded_by FKs
 * resolve at commit time — those rows become "ghost authors" with no credentials
 * (they cannot log in because user_credentials et al. are still excluded).
 *
 * NOT excluded:
 *   - `users`  — ghost authors; required for FK integrity on content tables
 *   - `media`  — explicitly carried in via the exporter's `includeMedia` flag
 *   - `roles`  — role definitions are part of the schema and survive resets
 *
 * Any future auth or log table MUST be added here; the policy test snapshots
 * this list so a missing entry fails CI.
 */
export const DEMO_EXCLUDES: ReadonlySet<string> = new Set([
  // Auth credentials & sessions — never ride along (the new admin is
  // created on top of the restored snapshot with a fresh UUID).
  // `users` itself IS included so demo content's created_by / uploaded_by
  // FKs resolve — those rows become "ghost authors" with no credentials.
  "user_credentials",
  "user_oauth_accounts",
  "user_email_tokens",
  "user_email_changes",
  "user_roles",
  "session_revocations",
  "api_tokens",
  // Logs / activity history — demo should land clean.
  "audit_log",
  "system_log",
  "failed_logins",
  "failed_jobs",
  "plugin_failures",
  // Operational state — never useful in a demo.
  // `migrations_log` is the migration audit history; importing the maintainer's
  // history would confuse the migration runner on the new install (it might
  // skip migrations it sees as already-applied). `migration_lock` is the
  // ephemeral row-lock state.
  "migrations_log",
  "migration_lock",
  "backups",
]);

/**
 * Install-specific `site_settings` keys redacted from the demo, beyond the
 * `encrypted` secrets. These carry maintainer PII / install config that must
 * not ship in a public bundle and that a fresh install configures itself:
 *
 *   - `smtp.*`            — mail server + account (the SMTP user/from address
 *                           is a real email; host/port are install config).
 *   - `seo.identity_data` — schema.org person/org identity (real name, photo,
 *                           social links) for the maintainer's own site.
 *
 * The demo lands with these unset; setup + the SEO/mail admin panels populate
 * them per install. Matched as exact keys or `<prefix>.` families.
 */
const DEMO_REDACTED_SETTING_KEYS: readonly string[] = [
  "smtp.",
  "seo.identity_data",
];

/**
 * Row-level redaction for the demo snapshot.
 *
 * `site_settings` rides along in the demo (SEO defaults, plugin config, home
 * layout, etc.), but secret / install-specific rows must not:
 *
 *   1. Every encrypted setting (`encrypted = 1`: SMTP password, API keys, …).
 *      The ciphertext is bound to the maintainer's AUTH_SECRET, so it's both
 *      undecryptable on a fresh install AND a secret leak. Keyed off the flag,
 *      not a key list, so future secrets are redacted automatically.
 *   2. The install-specific / PII keys in DEMO_REDACTED_SETTING_KEYS above.
 *
 * Returns `true` when the row MUST be dropped.
 */
export function isDemoRedactedRow(
  table: string,
  row: Record<string, unknown>
): boolean {
  if (table !== "site_settings") return false;
  if (Number(row.encrypted) === 1) return true;
  const key = String(row.key ?? "");
  return DEMO_REDACTED_SETTING_KEYS.some(
    (k) => key === k || (k.endsWith(".") && key.startsWith(k))
  );
}
