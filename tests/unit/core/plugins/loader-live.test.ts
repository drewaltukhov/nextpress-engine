import { describe, it, expect, vi, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import { fakePlugin } from "../../helpers/fake-plugin";
import { HookBus } from "@core/hooks/bus";
import { loadPluginLive, unloadPluginLive, isPluginLoaded } from "@core/plugins/loader";
import {
  listDashboardWidgets,
  _resetDashboardRegistry,
} from "@core/dashboard/registry";
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

/** Drop the globalThis-pinned loaded set so each test starts clean. */
function resetLoadedSet() {
  const g = globalThis as unknown as Record<string, Set<string> | undefined>;
  g["__nextpress_loaded_plugins__"] = new Set();
}

describe("loadPluginLive / unloadPluginLive", () => {
  let db: DbClient;
  let bus: HookBus;

  beforeEach(async () => {
    db = freshTestDb();
    bus = new HookBus();
    await ensurePluginsTable(db);
    resetLoadedSet();
    _resetDashboardRegistry();
  });

  it("runs register() on first call and reports alreadyLoaded on the second", async () => {
    const reg = vi.fn();
    const entry = fakePlugin({ slug: "alpha", register: reg });
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('alpha', '1.0.0', 1)"
    );

    const first = await loadPluginLive(
      { db, bus, discovered: [entry] },
      "alpha"
    );
    expect(first).toEqual({ ok: true, alreadyLoaded: false });
    expect(reg).toHaveBeenCalledTimes(1);
    expect(isPluginLoaded("alpha")).toBe(true);

    const second = await loadPluginLive(
      { db, bus, discovered: [entry] },
      "alpha"
    );
    expect(second).toEqual({ ok: true, alreadyLoaded: true });
    expect(reg).toHaveBeenCalledTimes(1);
  });

  it("unloadPluginLive clears bus hooks and dashboard widgets, and the plugin can be re-loaded", async () => {
    const hookFired = vi.fn();
    const entry = fakePlugin({
      slug: "beta",
      register: (api) => {
        // Register a typed action handler — the bus should drop it on unload
        api.hooks.action(
          "post.afterSave" as never,
          (async () => {
            hookFired();
          }) as never
        );
        // And a dashboard widget
        api.dashboard.registerWidget({
          slug: "beta.tile",
          title: "Beta",
          defaultSize: { w: 4, h: 2 },
          Component: () => null,
        });
      },
    });
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('beta', '1.0.0', 1)"
    );

    // Initial load — widget appears, hook fires.
    await loadPluginLive({ db, bus, discovered: [entry] }, "beta");
    expect(listDashboardWidgets().some((w) => w.slug === "beta.tile")).toBe(true);
    await bus.doAction("post.afterSave" as never, {} as never);
    expect(hookFired).toHaveBeenCalledTimes(1);

    // Unload — widget gone, hook no longer fires.
    unloadPluginLive({ bus }, "beta");
    expect(listDashboardWidgets().some((w) => w.slug === "beta.tile")).toBe(false);
    expect(isPluginLoaded("beta")).toBe(false);
    await bus.doAction("post.afterSave" as never, {} as never);
    expect(hookFired).toHaveBeenCalledTimes(1); // still 1 — disabled plugin doesn't fire

    // Reload — same plugin module, fresh registrations. Should not double-fire.
    const result = await loadPluginLive({ db, bus, discovered: [entry] }, "beta");
    expect(result).toEqual({ ok: true, alreadyLoaded: false });
    expect(listDashboardWidgets().some((w) => w.slug === "beta.tile")).toBe(true);
    await bus.doAction("post.afterSave" as never, {} as never);
    expect(hookFired).toHaveBeenCalledTimes(2); // exactly one new fire
  });

  it("returns an error when register() throws and bumps failure_count", async () => {
    const entry = fakePlugin({
      slug: "broken",
      register: () => {
        throw new Error("kaboom");
      },
    });
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('broken', '1.0.0', 1)"
    );

    const result = await loadPluginLive({ db, bus, discovered: [entry] }, "broken");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kaboom");
    expect(isPluginLoaded("broken")).toBe(false);

    const row = await db.execute(
      "SELECT failure_count FROM plugins WHERE slug='broken'"
    );
    expect(row.rows[0]?.failure_count).toBe(1);
  });

  it("auto-disables when register() failures cross the standard threshold", async () => {
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled, failure_count) VALUES ('flaky', '1.0.0', 1, 2)"
    );
    const entry = fakePlugin({
      slug: "flaky",
      register: () => {
        throw new Error("again");
      },
    });

    const result = await loadPluginLive({ db, bus, discovered: [entry] }, "flaky");
    expect(result.ok).toBe(false);

    const row = await db.execute(
      "SELECT enabled, failure_count FROM plugins WHERE slug='flaky'"
    );
    expect(row.rows[0]?.enabled).toBe(0);
    expect(row.rows[0]?.failure_count).toBe(3);
  });

  it("refuses to load when a dependency hasn't been loaded yet", async () => {
    const entry = fakePlugin({
      slug: "child",
      dependencies: ["parent"],
      register: vi.fn(),
    });
    await db.execute(
      "INSERT INTO plugins (slug, version, enabled) VALUES ('child', '1.0.0', 1)"
    );

    const result = await loadPluginLive({ db, bus, discovered: [entry] }, "child");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("parent");
    expect(isPluginLoaded("child")).toBe(false);
  });

  it("returns an error for an unknown slug", async () => {
    const result = await loadPluginLive({ db, bus, discovered: [] }, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ghost");
  });

  it("unloadPluginLive is a no-op for a plugin that was never loaded", () => {
    expect(() => unloadPluginLive({ bus }, "never-loaded")).not.toThrow();
  });
});
