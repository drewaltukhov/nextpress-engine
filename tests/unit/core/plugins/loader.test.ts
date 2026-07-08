import { describe, it, expect, vi, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import { fakePlugin } from "../../helpers/fake-plugin";
import { HookBus } from "@core/hooks/bus";
import { loadPlugins } from "@core/plugins/loader";
import {
  reserveSlug as registryReserve,
  releaseSlug as registryRelease,
  isSlugReserved
} from "@core/slugs/registry";
import type { DbClient } from "@core/db/client";

async function ensurePluginsTable(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS plugins (
      slug TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}',
      failure_count INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

describe("loadPlugins", () => {
  let db: DbClient;
  let bus: HookBus;

  beforeEach(async () => {
    db = freshTestDb();
    bus = new HookBus();
    await ensurePluginsTable(db);
  });

  it("registers each enabled plugin via its default export", async () => {
    const reg = vi.fn();
    const plugin = fakePlugin({ slug: "alpha", register: reg });
    await db.execute({
      sql: "INSERT INTO plugins (slug, version, enabled) VALUES (?, ?, 1)",
      args: ["alpha", "1.0.0"]
    });

    const result = await loadPlugins({
      db,
      bus,
      discovered: [plugin],
      env: { disabledPlugins: new Set(), safeMode: false }
    });

    expect(result.registered).toEqual(["alpha"]);
    expect(result.failed).toEqual([]);
    expect(reg).toHaveBeenCalledTimes(1);
  });

  it("inserts a row in plugins for newly-discovered plugins (enabled=false)", async () => {
    const plugin = fakePlugin({ slug: "freshy" });
    await loadPlugins({
      db,
      bus,
      discovered: [plugin],
      env: { disabledPlugins: new Set(), safeMode: false }
    });
    const row = await db.execute({
      sql: "SELECT slug, enabled FROM plugins WHERE slug = ?",
      args: ["freshy"]
    });
    expect(row.rows[0]?.slug).toBe("freshy");
    expect(row.rows[0]?.enabled).toBe(0);
  });

  it("does not register a plugin that is enabled=false", async () => {
    const reg = vi.fn();
    const plugin = fakePlugin({ slug: "off", register: reg });
    await db.execute({
      sql: "INSERT INTO plugins (slug, version, enabled) VALUES (?, ?, 0)",
      args: ["off", "1.0.0"]
    });
    await loadPlugins({
      db,
      bus,
      discovered: [plugin],
      env: { disabledPlugins: new Set(), safeMode: false }
    });
    expect(reg).not.toHaveBeenCalled();
  });

  it("isolates a register() that throws — others still register", async () => {
    const goodReg = vi.fn();
    const bad = fakePlugin({
      slug: "bad",
      register: () => {
        throw new Error("boom");
      }
    });
    const good = fakePlugin({ slug: "good", register: goodReg });
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('bad', '1.0.0', 1), ('good', '1.0.0', 1)"
    );

    const result = await loadPlugins({
      db,
      bus,
      discovered: [bad, good],
      env: { disabledPlugins: new Set(), safeMode: false }
    });

    expect(result.registered).toEqual(["good"]);
    expect(result.failed.map((f) => f.slug)).toEqual(["bad"]);
    expect(goodReg).toHaveBeenCalled();
  });

  it("auto-disables a plugin that has reached its failure threshold", async () => {
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled, failure_count) VALUES ('flaky', '1.0.0', 1, 2)"
    );
    const flaky = fakePlugin({
      slug: "flaky",
      register: () => {
        throw new Error("again");
      }
    });

    const result = await loadPlugins({
      db,
      bus,
      discovered: [flaky],
      env: { disabledPlugins: new Set(), safeMode: false }
    });

    expect(result.failed[0].autoDisabled).toBe(true);
    const row = await db.execute("SELECT enabled, failure_count FROM plugins WHERE slug='flaky'");
    expect(row.rows[0]?.enabled).toBe(0);
    expect(row.rows[0]?.failure_count).toBe(3);
  });

  it("uses 5-failure threshold for essential-tier plugins", async () => {
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled, failure_count) VALUES ('seo', '1.0.0', 1, 4)"
    );
    const seo = fakePlugin({
      slug: "seo",
      tier: "essential",
      register: () => {
        throw new Error("nope");
      }
    });

    const result = await loadPlugins({
      db,
      bus,
      discovered: [seo],
      env: { disabledPlugins: new Set(), safeMode: false }
    });
    expect(result.failed[0].autoDisabled).toBe(true);
    const row = await db.execute("SELECT failure_count FROM plugins WHERE slug='seo'");
    expect(row.rows[0]?.failure_count).toBe(5);
  });

  it("resets failure_count to 0 on a successful register()", async () => {
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled, failure_count) VALUES ('was-flaky', '1.0.0', 1, 2)"
    );
    const ok = fakePlugin({ slug: "was-flaky", register: () => {} });

    await loadPlugins({
      db,
      bus,
      discovered: [ok],
      env: { disabledPlugins: new Set(), safeMode: false }
    });

    const row = await db.execute("SELECT failure_count FROM plugins WHERE slug='was-flaky'");
    expect(row.rows[0]?.failure_count).toBe(0);
  });

  it("env.disabledPlugins overrides DB enabled=true", async () => {
    const reg = vi.fn();
    await db.execute("INSERT INTO plugins (slug, version, enabled) VALUES ('blocked', '1.0.0', 1)");
    const p = fakePlugin({ slug: "blocked", register: reg });

    await loadPlugins({
      db,
      bus,
      discovered: [p],
      env: { disabledPlugins: new Set(["blocked"]), safeMode: false }
    });
    expect(reg).not.toHaveBeenCalled();
  });

  it("safeMode skips standard-tier plugins; essential plugins still load", async () => {
    const stdReg = vi.fn();
    const essReg = vi.fn();
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('std', '1.0.0', 1), ('ess', '1.0.0', 1)"
    );
    const std = fakePlugin({ slug: "std", tier: "standard", register: stdReg });
    const ess = fakePlugin({ slug: "ess", tier: "essential", register: essReg });

    await loadPlugins({
      db,
      bus,
      discovered: [std, ess],
      env: { disabledPlugins: new Set(), safeMode: true }
    });

    expect(stdReg).not.toHaveBeenCalled();
    expect(essReg).toHaveBeenCalled();
  });
});

describe("loadPlugins — reserved-slug wiring", () => {
  it("a plugin's api.routes.reserveSlug call lands in reserved_slugs with source='plugin:<slug>'", async () => {
    const db = freshTestDb();
    const bus = new HookBus();
    await ensurePluginsTable(db);
    await db.execute(`
      CREATE TABLE reserved_slugs (
        slug TEXT NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL, reason TEXT NOT NULL, added_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, slug)
      )
    `);
    await db.execute("INSERT INTO plugins (slug, version, enabled) VALUES ('topics', '1.0.0', 1)");

    const topics = fakePlugin({
      slug: "topics",
      register: (api) => {
        api.routes.reserveSlug({ slug: "guides", reason: "Topic landings" });
      }
    });

    await loadPlugins({
      db,
      bus,
      discovered: [topics],
      env: { disabledPlugins: new Set(), safeMode: false },
      reserveSlug: (input) => registryReserve(db, input),
      releaseSlug: async (slug, source) => {
        await registryRelease(db, { slug, source });
      }
    });

    expect(await isSlugReserved(db, "guides")).toBe(true);
    const row = await db.execute("SELECT source FROM reserved_slugs WHERE slug='guides'");
    expect(row.rows[0]?.source).toBe("plugin:topics");
  });
});
