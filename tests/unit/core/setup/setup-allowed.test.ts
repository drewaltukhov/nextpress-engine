import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { STAFF, staffDb, type StaffUser } from "../../helpers/staff-db";
import { hashPassword } from "@core-plugins/users/passwords";

// The anonymous first-run wizard is an open "create the first admin" page, so
// it and the reset-to-wizard flow are off in production unless NEXTPRESS_ALLOW_SETUP=1,
// and production never silently falls back to an empty local database
// (security audit 2026-11-12: nextpress:setup:reset-reopens-unauthenticated-admin-claim,
// nextpress:boot:missing-db-url-falls-back-to-local-sqlite).

let session: { user: StaffUser } | null = null;

vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@core/auth", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const PASSWORD = "correct horse battery staple";
const { db, ready } = staffDb("setup-allowed");

beforeAll(async () => {
  await ready;
  await db.execute({ sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)", args: [STAFF.admin.id, await hashPassword(PASSWORD)] });
});

beforeEach(() => {
  session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSetupAllowed", () => {
  it("is on outside production, off in production unless NEXTPRESS_ALLOW_SETUP=1", async () => {
    const { isSetupAllowed } = await import("@core/setup/status");
    vi.stubEnv("NODE_ENV", "development");
    expect(isSetupAllowed()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isSetupAllowed()).toBe(false);
    vi.stubEnv("NEXTPRESS_ALLOW_SETUP", "1");
    expect(isSetupAllowed()).toBe(true);
  });
});

describe("in production without NEXTPRESS_ALLOW_SETUP", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("completeSetup refuses to create an admin even when setup is incomplete", async () => {
    const { completeSetup } = await import("@/app/admin/setup/actions");
    const r = await completeSetup({ adminEmail: "x@example.com", adminDisplayName: "X", adminPassword: PASSWORD, siteTitle: "T" } as never);
    expect(r.ok).toBe(false);
    const n = Number((await db.execute("SELECT COUNT(*) AS n FROM users WHERE email = 'x@example.com'")).rows[0]!.n);
    expect(n).toBe(0);
  });

  it("confirmReset refuses even for an admin with the right password", async () => {
    session = { user: { ...STAFF.admin } };
    const { confirmReset } = await import("@/app/admin/(shell)/reset/actions");
    const r = await confirmReset({ password: PASSWORD, confirmation: "RESET" });
    expect(r.ok).toBe(false);
    const n = Number((await db.execute("SELECT COUNT(*) AS n FROM users")).rows[0]!.n);
    expect(n).toBeGreaterThan(0);
  });

  it("readEnv refuses a missing TURSO_DATABASE_URL at runtime but not during next build", async () => {
    const { readEnv } = await import("@core/env");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    expect(() => readEnv()).toThrow(/TURSO_DATABASE_URL/);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(readEnv().databaseUrl).toBe("file:./.local/dev.db");
  });
});
