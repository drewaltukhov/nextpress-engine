import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDbClient, type DbClient } from "@core/db/client";
import { applyMigrations } from "@core/migrate/runner";
import { getSetting, setSetting, invalidateSettingsBulkCache } from "@core-plugins/settings/registry";
import { registerCoreSettingDefinitions } from "@core-plugins/settings/definitions";

// SMTP and site settings are admin-only, the stored SMTP password never
// leaves the server, and "Test connection" only reuses it for the stored
// server (security audit 2026-11-12,
// nextpress:admin-settings:auth-only-smtp-website-actions and
// nextpress:settings:smtp-password-decrypted-into-client-props).

let session: { user: { id: string; name: string; email: string; roles: string[] } } | null = null;
const transports: Array<Record<string, unknown>> = [];

vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@core/auth", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@core/email", () => ({ resetEmailTransport: () => {} }));
vi.mock("nodemailer", () => ({
  createTransport: (opts: Record<string, unknown>) => {
    transports.push(opts);
    return { verify: async () => true };
  },
}));

const SECRET = "test-secret-for-settings-encryption";
process.env.AUTH_SECRET = SECRET;
const dir = mkdtempSync(join(tmpdir(), "nextpress-smtp-authz-"));
const dbPath = join(dir, "test.db");
process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;
const db: DbClient = createDbClient({ databaseUrl: `file:${dbPath}`, authToken: undefined });

const ADMIN = { id: "admin-1", name: "Ada", email: "ada@example.com", roles: ["admin"] };
const AUTHOR = { id: "author-1", name: "Al", email: "al@example.com", roles: ["author"] };
const STORED_PASSWORD = "stored-app-password";

beforeAll(async () => {
  registerCoreSettingDefinitions();
  const d = (p: string) => resolve(process.cwd(), p);
  const res = await applyMigrations({
    db,
    owner: "test",
    plugins: [
      { slug: "core", migrationsDir: d("src/core/db/migrations/core") },
      { slug: "users", migrationsDir: d("src/core-plugins/users/migrations") },
      { slug: "settings", migrationsDir: d("src/core-plugins/settings/migrations") },
    ],
  });
  if (res.failures.length) throw new Error(JSON.stringify(res.failures));
  for (const u of [ADMIN, AUTHOR]) {
    await db.execute({ sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)", args: [u.id, u.email, u.name] });
  }
  await setSetting(db, "smtp.host", "smtp.example.com", { updatedBy: ADMIN.id });
  await setSetting(db, "smtp.port", 587, { updatedBy: ADMIN.id });
  await setSetting(db, "smtp.user", "mailer@example.com", { updatedBy: ADMIN.id });
  await setSetting(db, "smtp.password", STORED_PASSWORD, { updatedBy: ADMIN.id, secret: SECRET });
  await setSetting(db, "site.title", "Original", { updatedBy: ADMIN.id });
  invalidateSettingsBulkCache();
});

beforeEach(() => {
  transports.length = 0;
  session = { user: { ...AUTHOR } };
});

describe("non-admin sessions", () => {
  it("cannot save SMTP settings, run the SMTP test or save site settings", async () => {
    const smtp = await import("@/app/admin/(shell)/settings/smtp-actions");
    const site = await import("@/app/admin/(shell)/settings/website-actions");
    const save = await smtp.saveSmtpSettings({ host: "evil.example", port: 25, user: "x", password: "", fromAddress: "x@evil.example" });
    expect(save.ok).toBe(false);
    const test = await smtp.testSmtpConnection({ host: "evil.example", port: 25, user: "mailer@example.com", password: "" });
    expect(test.ok).toBe(false);
    expect(transports).toHaveLength(0);
    const web = await site.saveWebsiteSettings({ title: "Pwned", tagline: "", url: "https://evil.example", timezone: "UTC", dateFormat: "MMM d, yyyy", timeFormat: "12h" });
    expect(web.ok).toBe(false);
    invalidateSettingsBulkCache();
    expect(await getSetting(db, "smtp.host")).toBe("smtp.example.com");
    expect(await getSetting(db, "site.title")).toBe("Original");
  });
});

describe("admin sessions", () => {
  beforeEach(() => {
    session = { user: { ...ADMIN } };
  });

  it("never receive the stored SMTP password, only whether one is on file", async () => {
    const { getSmtpSettings } = await import("@/app/admin/(shell)/settings/smtp-actions");
    const s = await getSmtpSettings();
    expect(s).not.toHaveProperty("password");
    expect(s.passwordConfigured).toBe(true);
    expect(JSON.stringify(s)).not.toContain(STORED_PASSWORD);
  });

  it("can test the stored server with the stored password", async () => {
    const { testSmtpConnection } = await import("@/app/admin/(shell)/settings/smtp-actions");
    const r = await testSmtpConnection({ host: "smtp.example.com", port: 587, user: "mailer@example.com", password: "" });
    expect(r).toEqual({ ok: true });
    expect((transports[0]!.auth as { pass: string }).pass).toBe(STORED_PASSWORD);
  });

  it("must type a password to test a different server", async () => {
    const { testSmtpConnection } = await import("@/app/admin/(shell)/settings/smtp-actions");
    const r = await testSmtpConnection({ host: "other.example.com", port: 587, user: "mailer@example.com", password: "" });
    expect(r.ok).toBe(false);
    expect(transports).toHaveLength(0);
    const typed = await testSmtpConnection({ host: "other.example.com", port: 587, user: "mailer@example.com", password: "typed" });
    expect(typed).toEqual({ ok: true });
    expect((transports[0]!.auth as { pass: string }).pass).toBe("typed");
  });

  it("must type a password to save a different server", async () => {
    const { saveSmtpSettings } = await import("@/app/admin/(shell)/settings/smtp-actions");
    const r = await saveSmtpSettings({ host: "evil.example.net", port: 587, user: "mailer@example.com", password: "", fromAddress: "news@example.com" });
    expect(r.ok).toBe(false);
    invalidateSettingsBulkCache();
    expect(await getSetting(db, "smtp.host")).toBe("smtp.example.com");
  });

  it("can still save SMTP and site settings", async () => {
    const smtp = await import("@/app/admin/(shell)/settings/smtp-actions");
    const site = await import("@/app/admin/(shell)/settings/website-actions");
    expect(await smtp.saveSmtpSettings({ host: "smtp.example.com", port: 465, user: "mailer@example.com", password: "", fromAddress: "news@example.com" })).toEqual({ ok: true });
    expect(await site.saveWebsiteSettings({ title: "Renamed", tagline: "", url: "https://example.com", timezone: "UTC", dateFormat: "MMM d, yyyy", timeFormat: "12h" })).toEqual({ ok: true });
    invalidateSettingsBulkCache();
    expect(await getSetting(db, "smtp.port")).toBe(465);
    expect(await getSetting(db, "smtp.password", SECRET)).toBe(STORED_PASSWORD);
  });

  it("can switch email off by clearing the host without typing a password", async () => {
    const { saveSmtpSettings } = await import("@/app/admin/(shell)/settings/smtp-actions");
    expect(await saveSmtpSettings({ host: "", port: 587, user: "", password: "", fromAddress: "" })).toEqual({ ok: true });
  });
});
