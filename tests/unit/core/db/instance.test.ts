import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIG = { ...process.env };

/**
 * Reset every globalThis singleton key written by src/core/db/instance.ts
 * so tests don't see state carried over from earlier tests or module init.
 */
function resetGlobals(): void {
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith("__nextpress_db_")) {
      delete (globalThis as unknown as Record<string, unknown>)[key];
    }
  }
}

describe("db() — synchronous Turso compat", () => {
  beforeEach(() => {
    process.env = { ...ORIG };
    delete process.env.NEXTPRESS_DB_PROVIDER;
    resetGlobals();
  });
  afterEach(() => {
    process.env = ORIG;
    resetGlobals();
  });

  it("returns a libSQL client under Turso provider (sync)", async () => {
    const mod = await import("@core/db/instance");
    const client = mod.db();
    expect(client).toBeDefined();
    expect(typeof (client as { execute?: unknown }).execute).toBe("function");
  });

  it("returns the same instance across calls (singleton)", async () => {
    const mod = await import("@core/db/instance");
    const a = mod.db();
    const b = mod.db();
    expect(a).toBe(b);
  });

  it("returns a libSQL-shaped facade in Supabase mode (Phase 2)", async () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "postgres://x@y/z";
    process.env.DATABASE_URL_PUBLIC = "postgres://a@b/c";
    const mod = await import("@core/db/instance");
    const client = mod.db();
    // The facade implements the libSQL Client surface — `.execute` is the
    // load-bearing method. Phase 1 threw here; Phase 2 returns the facade.
    expect(client).toBeDefined();
    expect(typeof (client as { execute?: unknown }).execute).toBe("function");
  });
});

describe("dbAdmin() / dbPublic() — promise-based singletons", () => {
  beforeEach(() => {
    process.env = { ...ORIG };
    resetGlobals();
  });
  afterEach(() => {
    process.env = ORIG;
    resetGlobals();
  });

  it("dbAdmin() throws in Turso mode", async () => {
    delete process.env.NEXTPRESS_DB_PROVIDER;
    const mod = await import("@core/db/instance");
    await expect(mod.dbAdmin()).rejects.toThrow(/Supabase mode/i);
  });

  it("dbPublic() throws in Turso mode", async () => {
    delete process.env.NEXTPRESS_DB_PROVIDER;
    const mod = await import("@core/db/instance");
    await expect(mod.dbPublic()).rejects.toThrow(/Supabase mode/i);
  });

  it("concurrent dbAdmin() calls share one initialization promise (Supabase mode)", async () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "postgres://x@y/z";
    process.env.DATABASE_URL_PUBLIC = "postgres://a@b/c";
    const mod = await import("@core/db/instance");
    const [a, b, c] = await Promise.all([mod.dbAdmin(), mod.dbAdmin(), mod.dbAdmin()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("dbAdmin() and dbPublic() return distinct instances (Supabase mode)", async () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "postgres://x@y/z";
    process.env.DATABASE_URL_PUBLIC = "postgres://a@b/c";
    const mod = await import("@core/db/instance");
    const admin = await mod.dbAdmin();
    const pub = await mod.dbPublic();
    expect(admin).not.toBe(pub);
  });
});
