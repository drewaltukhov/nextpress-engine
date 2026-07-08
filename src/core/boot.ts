import { type DbClient } from "@core/db/client";
import { db as getDbClient, ensureSync } from "@core/db/instance";
import { readEnv } from "@core/env";
import { HookBus } from "@core/hooks/bus";
import { loadPlugins, topoSort } from "@core/plugins/loader";
import { PluginFailureRing, type PluginFailureRecord } from "@core/plugins/failures";
import { reserveSlug, releaseSlug } from "@core/slugs/registry";
import { discoveredPlugins } from "@generated/plugins";
import { applyMigrations } from "@core/migrate/runner";
import { recordPluginFailure } from "@core-plugins/logging";
import { registerBuiltInDashboardWidgets } from "@core/dashboard/widgets";
import { registerUpdateCheck } from "@core/updates/check";
import { resolve } from "node:path";

let bootPromise: Promise<{ bus: HookBus }> | null = null;

// Pin the boot bus to globalThis so server actions (e.g. togglePlugin) can
// reach the same instance the loader registered handlers into. Without this,
// a live `register()` call from a route module would land on a different bus
// than the one boot built — handlers would fire into the void and widgets
// would register against a registry the dashboard reads, but hooks wouldn't.
const BUS_KEY = "__nextpress_boot_bus__" as const;
function setBootBus(bus: HookBus): void {
  (globalThis as unknown as Record<string, HookBus>)[BUS_KEY] = bus;
}

/**
 * Returns the boot HookBus once `bootEngine()` has resolved on this process.
 * Call sites that need to register/unregister plugin hooks at runtime should
 * use this rather than holding their own `new HookBus()`.
 */
export function getBootBus(): HookBus | null {
  return (globalThis as unknown as Record<string, HookBus | undefined>)[BUS_KEY] ?? null;
}

function buildFailurePersister(db: DbClient): (rec: PluginFailureRecord) => Promise<void> {
  return async (rec) => {
    await recordPluginFailure(db, {
      pluginSlug: rec.pluginSlug,
      // Ring sources `boot|hook`; map to plugin_failures.phase enum. Plugin
      // load-time errors land in the `register` phase per the schema CHECK.
      phase: rec.source === "boot" ? "register" : "hook",
      hookName: rec.hookName ?? null,
      errorMessage: rec.message,
      errorStack: rec.stack ?? null
    });
  };
}

const KERNEL_MIGRATIONS_DIR = resolve(process.cwd(), "src/core/db/migrations/core");

export function bootEngine(): Promise<{ bus: HookBus }> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const env = readEnv();
    // Use the globalThis-pinned singleton so boot and request paths share one
    // libSQL client. Multiple clients on the same local replica file each run
    // their own sync timer and race for the WAL checkpoint — surfaces as
    // SQLITE_BUSY on writes.
    const db = getDbClient();
    // Block until the embedded replica has pulled remote schema/data. Otherwise
    // applyMigrations races against an empty local file and re-applies migrations
    // that already exist on the remote.
    await ensureSync();
    const bus = new HookBus();
    setBootBus(bus);

    // Phase 1: always apply migrations on boot. Phase 14 introduces
    // site_settings.deploy.auto_migrate as the toggle.
    const sources = [
      { slug: "core", migrationsDir: KERNEL_MIGRATIONS_DIR },
      ...topoSort(discoveredPlugins)
        .filter((p) => p.migrationsDir)
        .map((p) => ({
          slug: p.manifest.slug,
          migrationsDir: resolve(process.cwd(), p.migrationsDir as string)
        }))
    ];
    const migResult = await applyMigrations({ db, plugins: sources, owner: `boot:${process.pid}` });
    if (migResult.lockHeld) {
      console.warn(`[boot] migration lock held by ${migResult.heldBy}; skipping migrations this boot.`);
    }
    for (const f of migResult.failures) {
      console.error(`[boot] migration failure: ${f.pluginSlug}/${f.fileName}: ${f.error}`);
    }

    const failures = new PluginFailureRing({ persist: buildFailurePersister(db) });

    // Register engine-shipped dashboard widgets before plugin loaders run,
    // so they appear ahead of plugin widgets in registration order.
    registerBuiltInDashboardWidgets();

    // Register the engine-version cache so /admin/updates can read it.
    registerUpdateCheck();

    await loadPlugins({
      db,
      bus,
      discovered: discoveredPlugins,
      env: { disabledPlugins: env.disabledPlugins, safeMode: env.safeMode },
      reserveSlug: (input) => reserveSlug(db, input),
      releaseSlug: async (slug, source) => {
        await releaseSlug(db, { slug, source });
      },
      failures
    });

    return { bus };
  })();
  return bootPromise;
}
