import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbClient, type DbClient } from "@core/db/client";
import { invalidateSettingsBulkCache } from "@core-plugins/settings/registry";

let counter = 0;

/**
 * Returns a libSQL client backed by a fresh on-disk file in the OS tmp dir.
 * Each call creates a unique file, so tests are fully isolated.
 *
 * The file is left on disk after the test (cleaned up on reboot via /tmp).
 * If you need explicit cleanup, register a teardown that calls db.close()
 * and rmSync on the path.
 *
 * Also clears every process-scoped read-through cache so a test that follows
 * one which warmed a cache for its own DB doesn't see stale rows.
 */
export function freshTestDb(): DbClient {
  counter += 1;
  const dir = mkdtempSync(join(tmpdir(), `nextpress-test-${counter}-`));
  const path = join(dir, "test.db");
  resetProcessCaches();
  return createDbClient({ databaseUrl: `file:${path}`, authToken: undefined });
}

/**
 * Reset every process-scoped read-through cache. Called from `freshTestDb`
 * so tests don't leak cached data across suite boundaries.
 *
 * Add new caches here as they're introduced.
 */
export function resetProcessCaches(): void {
  // Settings bulk cache
  invalidateSettingsBulkCache();
  // Other caches clear their own globalThis slots directly to avoid pulling
  // every module in via static imports here (some are heavy server-only).
  (globalThis as Record<string, unknown>)["__nextpress_theme_data_bulk__"] = undefined;
  (globalThis as Record<string, unknown>)["__nextpress_theme_data_bulk_at__"] = undefined;
  // Menus
  (globalThis as Record<string, unknown>)["__nextpress_menu_cache__"] = undefined;
  (globalThis as Record<string, unknown>)["__nextpress_menu_cache_at__"] = undefined;
  // Redirects
  (globalThis as Record<string, unknown>)["__nextpress_redirects_cache__"] = undefined;
  (globalThis as Record<string, unknown>)["__nextpress_redirects_cache_at__"] = undefined;
  // Allowed-IPs CIDR list
  (globalThis as Record<string, unknown>)["__nextpress_allowed_ips_cache__"] = undefined;
  (globalThis as Record<string, unknown>)["__nextpress_allowed_ips_cache_at__"] = undefined;
}
