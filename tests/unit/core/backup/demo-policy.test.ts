import { describe, it, expect } from "vitest";
import { DEMO_EXCLUDES, isDemoRedactedRow } from "@core/backup/demo-policy";

describe("DEMO_EXCLUDES", () => {
  it("excludes every auth credential, token, and log table by exact name", () => {
    const expected = [
      "user_credentials",
      "user_oauth_accounts",
      "user_email_tokens",
      "user_email_changes",
      "user_roles",
      "session_revocations",
      "api_tokens",
      "audit_log",
      "system_log",
      "failed_logins",
      "failed_jobs",
      "plugin_failures",
      "migrations_log",
      "migration_lock",
      "backups",
    ];
    expect([...DEMO_EXCLUDES].sort()).toEqual(expected.sort());
  });

  it("does NOT exclude `media` (the demo override that brings blobs in)", () => {
    expect(DEMO_EXCLUDES.has("media")).toBe(false);
  });

  it("does NOT exclude `roles` (role definitions ride along with the demo)", () => {
    expect(DEMO_EXCLUDES.has("roles")).toBe(false);
  });

  it("does NOT exclude `users` — content FKs (posts.created_by etc.) need the user rows to resolve at commit time. Credentials/tokens stay excluded so demo users can't log in.", () => {
    expect(DEMO_EXCLUDES.has("users")).toBe(false);
  });
});

describe("isDemoRedactedRow", () => {
  it("drops encrypted site_settings rows (SMTP password, API keys, …)", () => {
    expect(isDemoRedactedRow("site_settings", { key: "smtp.password", encrypted: 1 })).toBe(true);
    expect(isDemoRedactedRow("site_settings", { key: "crypto-beat.api_key", encrypted: 1 })).toBe(true);
  });

  it("drops install-specific PII settings even when not encrypted", () => {
    // SMTP account/config — the user/from address is a real email.
    expect(isDemoRedactedRow("site_settings", { key: "smtp.user", encrypted: 0 })).toBe(true);
    expect(isDemoRedactedRow("site_settings", { key: "smtp.from_address", encrypted: 0 })).toBe(true);
    expect(isDemoRedactedRow("site_settings", { key: "smtp.host", encrypted: 0 })).toBe(true);
    // schema.org identity — carries the maintainer's real name.
    expect(isDemoRedactedRow("site_settings", { key: "seo.identity_data", encrypted: 0 })).toBe(true);
  });

  it("keeps non-encrypted site_settings rows (SEO defaults, plugin config, …)", () => {
    expect(isDemoRedactedRow("site_settings", { key: "seo.default_description", encrypted: 0 })).toBe(false);
    expect(isDemoRedactedRow("site_settings", { key: "content.home_mode", encrypted: 0 })).toBe(false);
    // Not a prefix-family false positive: "smtp" without a dot, and other seo.* keys stay.
    expect(isDemoRedactedRow("site_settings", { key: "seo.default_og_image", encrypted: 0 })).toBe(false);
  });

  it("never redacts rows from other tables, even with a stray `encrypted` field", () => {
    expect(isDemoRedactedRow("posts", { id: 1, encrypted: 1 })).toBe(false);
    expect(isDemoRedactedRow("users", { id: "u1", encrypted: 1 })).toBe(false);
  });
});
