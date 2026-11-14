import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDbClient, type DbClient } from "@core/db/client";
import { applyMigrations } from "@core/migrate/runner";
import { invalidateSettingsBulkCache } from "@core-plugins/settings/registry";
import { hashPassword } from "@core-plugins/users/passwords";

// User and role management server actions are directly invokable endpoints:
// the proxy's admin-route gate only covers page navigation, so every action
// must refuse a non-admin session itself (security audit 2026-11-12,
// nextpress:admin-users:auth-only-user-mutations).

let session: { user: { id: string; name: string; email: string; roles: string[] } } | null = null;

vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@core/auth", () => ({ auth: async () => session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost" }) }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@core/email", () => ({ sendEmail: async () => ({ ok: true }) }));

const dir = mkdtempSync(join(tmpdir(), "nextpress-users-authz-"));
const dbPath = join(dir, "test.db");
process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;
const db: DbClient = createDbClient({ databaseUrl: `file:${dbPath}`, authToken: undefined });

const ADMIN = { id: "admin-1", name: "Ada", email: "ada@example.com", roles: ["admin"] };
const AUTHOR = { id: "author-1", name: "Al", email: "al@example.com", roles: ["author"] };

beforeAll(async () => {
  const d = (p: string) => resolve(process.cwd(), p);
  const res = await applyMigrations({
    db,
    owner: "test",
    plugins: [
      { slug: "core", migrationsDir: d("src/core/db/migrations/core") },
      { slug: "users", migrationsDir: d("src/core-plugins/users/migrations") },
      { slug: "settings", migrationsDir: d("src/core-plugins/settings/migrations") },
      { slug: "logging", migrationsDir: d("src/core-plugins/logging/migrations") },
      { slug: "security", migrationsDir: d("src/core-plugins/security/migrations") },
    ],
  });
  if (res.failures.length) throw new Error(JSON.stringify(res.failures));
  for (const u of [ADMIN, AUTHOR]) {
    await db.execute({ sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)", args: [u.id, u.email, u.name] });
    await db.execute({ sql: "INSERT INTO user_roles (user_id, role_slug) VALUES (?, ?)", args: [u.id, u.roles[0]] });
    await db.execute({ sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)", args: [u.id, await hashPassword("correct horse battery staple")] });
  }
  invalidateSettingsBulkCache();
});

beforeEach(() => {
  session = { user: { ...AUTHOR } };
});

async function rolesOf(id: string): Promise<string[]> {
  const r = await db.execute({ sql: "SELECT role_slug FROM user_roles WHERE user_id = ?", args: [id] });
  return r.rows.map((x) => String(x.role_slug));
}
async function statusOf(id: string): Promise<string> {
  return String((await db.execute({ sql: "SELECT status FROM users WHERE id = ?", args: [id] })).rows[0]!.status);
}

describe("user actions refuse non-admin sessions", () => {
  it("an author cannot make itself admin through updateUser", async () => {
    const { updateUser } = await import("@/app/admin/(shell)/users/actions");
    const r = await updateUser({ id: AUTHOR.id, displayName: "Al", role: "admin" });
    expect(r.ok).toBe(false);
    expect(await rolesOf(AUTHOR.id)).toEqual(["author"]);
  });

  it("an author can still save its own profile fields", async () => {
    const { updateUser } = await import("@/app/admin/(shell)/users/actions");
    const r = await updateUser({ id: AUTHOR.id, displayName: "Al Renamed", bio: "hi", role: "author" });
    expect(r).toEqual({ ok: true });
    const row = (await db.execute({ sql: "SELECT display_name FROM users WHERE id = ?", args: [AUTHOR.id] })).rows[0]!;
    expect(String(row.display_name)).toBe("Al Renamed");
    expect(await rolesOf(AUTHOR.id)).toEqual(["author"]);
  });

  it("an author cannot edit another user", async () => {
    const { updateUser } = await import("@/app/admin/(shell)/users/actions");
    const r = await updateUser({ id: ADMIN.id, displayName: "Pwned", role: "author" });
    expect(r.ok).toBe(false);
    expect(await rolesOf(ADMIN.id)).toEqual(["admin"]);
  });

  it("an author cannot create, disable, delete, re-email or reset users", async () => {
    const m = await import("@/app/admin/(shell)/users/actions");
    expect((await m.createUser({ email: "x@example.com", displayName: "X", password: "correct horse battery staple", role: "admin", sendInvite: false })).ok).toBe(false);
    expect((await m.toggleUserStatus(ADMIN.id, "disabled")).ok).toBe(false);
    expect(await statusOf(ADMIN.id)).toBe("active");
    expect((await m.deleteUser(ADMIN.id, "correct horse battery staple")).ok).toBe(false);
    expect((await m.changeEmailBootstrap(ADMIN.id, "new@example.com", "correct horse battery staple")).ok).toBe(false);
    expect((await m.requestPasswordReset(ADMIN.id)).ok).toBe(false);
    const count = Number((await db.execute("SELECT COUNT(*) AS n FROM users")).rows[0]!.n);
    expect(count).toBe(2);
  });

  it("an author can still request a reset link for its own password (profile card)", async () => {
    const { requestPasswordReset } = await import("@/app/admin/(shell)/users/actions");
    expect(await requestPasswordReset(AUTHOR.id)).toEqual({ ok: true });
  });

  it("an author gets no user listings", async () => {
    const m = await import("@/app/admin/(shell)/users/actions");
    expect(await m.getUsers()).toEqual([]);
    expect(await m.getReassignCandidates(AUTHOR.id)).toEqual([]);
    expect((await m.getUserContentSummary(ADMIN.id)).total).toBe(0);
    expect(await m.getUser(ADMIN.id)).toBeNull();
    expect((await m.getUser(AUTHOR.id))?.id).toBe(AUTHOR.id);
    expect((await m.checkEmailAvailable("free@example.com")).available).toBe(false);
  });

  it("anonymous callers get nothing", async () => {
    session = null;
    const m = await import("@/app/admin/(shell)/users/actions");
    expect(await m.getUsers()).toEqual([]);
    expect(await m.getRoles()).toEqual([]);
  });
});

describe("role actions refuse non-admin sessions", () => {
  it("an author cannot add permissions to a role or create a role", async () => {
    const m = await import("@/app/admin/(shell)/roles/actions");
    const before = String((await db.execute("SELECT permissions FROM roles WHERE slug = 'author'")).rows[0]!.permissions);
    expect((await m.setRolePermission("author", "posts", "new", true)).ok).toBe(false);
    expect(String((await db.execute("SELECT permissions FROM roles WHERE slug = 'author'")).rows[0]!.permissions)).toBe(before);
    expect((await m.createRole({ label: "Sneaky", enabledPermissions: ["posts.new"] })).ok).toBe(false);
    expect(await m.getRolesWithUsage()).toEqual([]);
  });
});

describe("admins keep full user management", () => {
  beforeEach(() => {
    session = { user: { ...ADMIN } };
  });

  it("an admin can change another user's role and status", async () => {
    const m = await import("@/app/admin/(shell)/users/actions");
    expect(await m.updateUser({ id: AUTHOR.id, displayName: "Al", role: "editor" })).toEqual({ ok: true });
    expect(await rolesOf(AUTHOR.id)).toEqual(["editor"]);
    expect(await m.toggleUserStatus(AUTHOR.id, "disabled")).toEqual({ ok: true });
    expect(await statusOf(AUTHOR.id)).toBe("disabled");
    await m.toggleUserStatus(AUTHOR.id, "active");
    await m.updateUser({ id: AUTHOR.id, displayName: "Al", role: "author" });
    expect((await m.getUsers()).length).toBe(2);
  });
});
