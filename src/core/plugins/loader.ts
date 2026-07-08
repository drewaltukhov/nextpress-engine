import { resolve } from "node:path";
import { drizzle as drizzleLibSql } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import type { DbClient } from "@core/db/client";
import type { HookBus } from "@core/hooks/bus";
import { plugins } from "@core/db/schema/plugins";
import type { PluginManifest } from "./manifest";
import type { PluginAPI } from "./api";
import { createPluginAPI } from "./api";
import { PluginFailureRing } from "./failures";
import { applyMigrations } from "@core/migrate/runner";
import { unregisterDashboardWidgetsBySource } from "@core/dashboard/registry";

export interface DiscoveredEntry {
  manifest: PluginManifest;
  module: { default?: (api: PluginAPI) => void | Promise<void> };
  migrationsDir: string | null;
}

export interface EnvFlags {
  disabledPlugins: ReadonlySet<string>;
  safeMode: boolean;
}

export interface LoadArgs {
  db: DbClient;
  bus: HookBus;
  discovered: DiscoveredEntry[];
  env: EnvFlags;
  reserveSlug?: (input: { slug: string; reason: string; source: string }) => void | Promise<void>;
  releaseSlug?: (slug: string, source: string) => void | Promise<void>;
  failures?: PluginFailureRing;
}

export interface LoadResult {
  registered: string[];
  failed: { slug: string; error: string; autoDisabled: boolean }[];
  skipped: { slug: string; reason: "disabled-in-db" | "disabled-by-env" | "safe-mode" | "missing-dep" }[];
}

const DEFAULT_THRESHOLDS: Record<"essential" | "standard", number> = {
  essential: 5,
  standard: 3
};

async function upsertPluginRow(db: DbClient, manifest: PluginManifest): Promise<void> {
  // Essential plugins (users, logging, security, api, redirects, settings,
  // seo) cannot be toggled off via the UI — the togglePlugin server action
  // explicitly refuses. So they need to default to enabled=true on insert,
  // and the ON CONFLICT branch must force them back to true if a prior run
  // ever left them disabled (e.g. a stale row from before this fix). Non-
  // essentials default to disabled so the user opts in.
  const initial = manifest.tier === "essential";
  await drizzleLibSql(db)
    .insert(plugins)
    .values({
      slug: manifest.slug,
      version: manifest.version,
      enabled: initial,
      settings: {},
      failureCount: 0
    })
    .onConflictDoUpdate({
      target: plugins.slug,
      set: {
        version: sql`excluded.version`,
        // Re-enable essentials on every upsert, but never auto-flip a
        // disabled non-essential back to enabled.
        enabled: initial ? sql`1` : sql`${plugins.enabled}`,
        updatedAt: sql`CURRENT_TIMESTAMP`
      }
    });
}

async function readPluginRow(
  db: DbClient,
  slug: string
): Promise<{ enabled: number; failure_count: number } | null> {
  const rows = await drizzleLibSql(db)
    .select({ enabled: plugins.enabled, failureCount: plugins.failureCount })
    .from(plugins)
    .where(eq(plugins.slug, slug));
  const row = rows[0];
  return row
    ? { enabled: row.enabled ? 1 : 0, failure_count: Number(row.failureCount) }
    : null;
}

async function bumpFailureCount(db: DbClient, slug: string): Promise<number> {
  await drizzleLibSql(db)
    .update(plugins)
    .set({
      failureCount: sql`failure_count + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(plugins.slug, slug));
  const r = await readPluginRow(db, slug);
  return r?.failure_count ?? 0;
}

async function resetFailureCount(db: DbClient, slug: string): Promise<void> {
  await drizzleLibSql(db)
    .update(plugins)
    .set({
      failureCount: 0,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(plugins.slug, slug));
}

async function autoDisable(db: DbClient, slug: string): Promise<void> {
  await drizzleLibSql(db)
    .update(plugins)
    .set({
      enabled: false,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(plugins.slug, slug));
}

/**
 * Order plugins so that every plugin's `manifest.dependencies` appear
 * before it in the result. The runtime register() flow uses this; the
 * migration entry points (boot + CLI) reuse it so dependent plugins'
 * tables exist before dependants seed against them — an alphabetical
 * order would put `settings` before `users` and FK-fail on first run.
 */
export function topoSort(entries: DiscoveredEntry[]): DiscoveredEntry[] {
  const bySlug = new Map(entries.map((e) => [e.manifest.slug, e]));
  const visited = new Set<string>();
  const out: DiscoveredEntry[] = [];

  function visit(e: DiscoveredEntry, stack: string[]) {
    if (visited.has(e.manifest.slug)) return;
    if (stack.includes(e.manifest.slug)) {
      throw new Error(
        `Plugin dependency cycle detected: ${[...stack, e.manifest.slug].join(" → ")}`
      );
    }
    for (const dep of e.manifest.dependencies) {
      const depEntry = bySlug.get(dep);
      if (depEntry) visit(depEntry, [...stack, e.manifest.slug]);
    }
    visited.add(e.manifest.slug);
    out.push(e);
  }

  for (const e of entries) visit(e, []);
  return out;
}

// ---------------------------------------------------------------------------
// Live load/unload — used by the togglePlugin server action so the user
// doesn't need a server restart to pick up a freshly-enabled plugin.
//
// The "loaded" set tracks which plugins this Node process has already run
// `register()` for, so a re-enable doesn't double-register hooks/widgets.
// Pinned to globalThis to survive Turbopack hot-reload, same as everything
// else in this codebase that holds module-level state.
// ---------------------------------------------------------------------------

const LOADED_KEY = "__nextpress_loaded_plugins__" as const;
function loadedSet(): Set<string> {
  const g = globalThis as unknown as Record<string, Set<string> | undefined>;
  if (!g[LOADED_KEY]) g[LOADED_KEY] = new Set();
  return g[LOADED_KEY]!;
}

/** Mark a plugin as loaded — used by `loadPlugins()` so live load can skip it. */
function markLoaded(slug: string): void {
  loadedSet().add(slug);
}

/** Has the plugin's `register()` already executed in this process? */
export function isPluginLoaded(slug: string): boolean {
  return loadedSet().has(slug);
}

export interface LiveLoadArgs {
  db: DbClient;
  bus: HookBus;
  discovered: DiscoveredEntry[];
  reserveSlug?: (input: { slug: string; reason: string; source: string }) => void | Promise<void>;
  releaseSlug?: (slug: string, source: string) => void | Promise<void>;
}

export type LiveLoadResult =
  | { ok: true; alreadyLoaded: boolean }
  | { ok: false; error: string };

/**
 * Run `register()` for one plugin without rebooting. Idempotent — if the
 * plugin already loaded this process, returns `alreadyLoaded: true`. Applies
 * any pending migrations first.
 */
export async function loadPluginLive(args: LiveLoadArgs, slug: string): Promise<LiveLoadResult> {
  const entry = args.discovered.find((d) => d.manifest.slug === slug);
  if (!entry) return { ok: false, error: `Plugin "${slug}" not found in discovered list` };
  if (loadedSet().has(slug)) return { ok: true, alreadyLoaded: true };

  // Dependencies must already be loaded — they were either loaded at boot
  // (most common case for essentials) or via a prior live-load. Standard
  // plugins generally only depend on essentials, so this just enforces the
  // boot ordering guarantee.
  for (const dep of entry.manifest.dependencies) {
    if (!loadedSet().has(dep)) {
      return { ok: false, error: `Dependency "${dep}" is not loaded; enable it first` };
    }
  }

  // Apply any pending migrations for this plugin. The runner is idempotent —
  // already-applied files are skipped via `migrations_log`.
  if (entry.migrationsDir) {
    const migResult = await applyMigrations({
      db: args.db,
      plugins: [{ slug, migrationsDir: resolve(process.cwd(), entry.migrationsDir) }],
      owner: `live:${process.pid}:${slug}`,
    });
    const failure = migResult.failures.find((f) => f.pluginSlug === slug);
    if (failure) {
      return { ok: false, error: `Migration failed: ${failure.fileName}: ${failure.error}` };
    }
  }

  const api = createPluginAPI({
    pluginSlug: slug,
    manifestType: entry.manifest.type,
    bus: args.bus,
    reserveSlug: args.reserveSlug ?? (() => {}),
    releaseSlug: args.releaseSlug ?? (() => {}),
  });

  try {
    await entry.module.default?.(api);
    await resetFailureCount(args.db, slug);
    markLoaded(slug);
    return { ok: true, alreadyLoaded: false };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const newCount = await bumpFailureCount(args.db, slug);
    const threshold = DEFAULT_THRESHOLDS[entry.manifest.tier];
    if (newCount >= threshold) await autoDisable(args.db, slug);
    args.bus.clearPlugin(slug);
    return { ok: false, error: error.message };
  }
}

/**
 * Live-disable a plugin: clear its hook handlers and dashboard widgets so
 * the dashboard stops surfacing them. Settings registry definitions and
 * plugin-cache registrations are deliberately left in place — they're
 * harmless once the plugin's UI is gated by the DB flag, and removing them
 * would require unregister machinery we don't need yet.
 *
 * Idempotent — safe to call for a plugin that wasn't loaded.
 */
export function unloadPluginLive(args: { bus: HookBus }, slug: string): void {
  args.bus.clearPlugin(slug);
  unregisterDashboardWidgetsBySource(slug);
  loadedSet().delete(slug);
}

export async function loadPlugins(args: LoadArgs): Promise<LoadResult> {
  const failures = args.failures ?? new PluginFailureRing();
  args.bus.onFailure((f) => failures.recordHook(f));

  const result: LoadResult = { registered: [], failed: [], skipped: [] };
  const ordered = topoSort(args.discovered);

  for (const entry of ordered) {
    const slug = entry.manifest.slug;
    await upsertPluginRow(args.db, entry.manifest);

    const row = await readPluginRow(args.db, slug);
    const dbEnabled = row?.enabled === 1;

    if (args.env.disabledPlugins.has(slug)) {
      result.skipped.push({ slug, reason: "disabled-by-env" });
      continue;
    }
    if (!dbEnabled) {
      result.skipped.push({ slug, reason: "disabled-in-db" });
      continue;
    }
    if (args.env.safeMode && entry.manifest.tier !== "essential") {
      result.skipped.push({ slug, reason: "safe-mode" });
      continue;
    }

    const missingDep = entry.manifest.dependencies.find((d) => {
      const dep = ordered.find((e) => e.manifest.slug === d);
      return !dep || !result.registered.includes(d);
    });
    if (missingDep) {
      result.skipped.push({ slug, reason: "missing-dep" });
      continue;
    }

    const api = createPluginAPI({
      pluginSlug: slug,
      manifestType: entry.manifest.type,
      bus: args.bus,
      reserveSlug: args.reserveSlug ?? (() => {}),
      releaseSlug: args.releaseSlug ?? (() => {})
    });

    try {
      await entry.module.default?.(api);
      await resetFailureCount(args.db, slug);
      markLoaded(slug);
      result.registered.push(slug);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      failures.recordBoot(slug, error);
      const newCount = await bumpFailureCount(args.db, slug);
      const threshold = DEFAULT_THRESHOLDS[entry.manifest.tier];
      const autoDisabled = newCount >= threshold;
      if (autoDisabled) await autoDisable(args.db, slug);
      args.bus.clearPlugin(slug);
      result.failed.push({ slug, error: error.message, autoDisabled });
    }
  }

  return result;
}
