import type { DbClient } from "@core/db/client";
import { drizzle as drizzleLibSql } from "drizzle-orm/libsql";
import { eq, and } from "drizzle-orm";
import { migrationsLog } from "@core/db/schema/migrations-log";
import { discoverPluginMigrations, type DiscoveredMigration } from "./discover";
import { acquireLock, releaseLock, ensureLockTable } from "./lock";

export interface PluginMigrationSource {
  slug: string;
  migrationsDir: string;
}

export interface ApplyArgs {
  db: DbClient;
  plugins: PluginMigrationSource[];
  owner: string;
  appliedBy?: string | null;
  staleMs?: number;
}

export interface ApplyResult {
  applied: DiscoveredMigration[];
  skipped: DiscoveredMigration[];
  failures: { pluginSlug: string; fileName: string; error: string }[];
  lockHeld?: boolean;
  heldBy?: string;
}

const KERNEL_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS migrations_log (
    plugin_slug    TEXT NOT NULL,
    migration_name TEXT NOT NULL,
    applied_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by     TEXT,
    execution_ms   INTEGER,
    checksum       TEXT NOT NULL,
    PRIMARY KEY (plugin_slug, migration_name)
  );
  CREATE INDEX IF NOT EXISTS migrations_log_applied_at_idx ON migrations_log (applied_at);
`;

async function ensureBootstrapTables(db: DbClient): Promise<void> {
  await ensureLockTable(db);
  for (const stmt of KERNEL_BOOTSTRAP_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
}

async function alreadyApplied(db: DbClient, pluginSlug: string, fileName: string): Promise<{ checksum: string } | null> {
  // Drizzle query builder (replaces raw SQL for dialect-portable shape)
  const rows = await drizzleLibSql(db)
    .select({ checksum: migrationsLog.checksum })
    .from(migrationsLog)
    .where(and(eq(migrationsLog.pluginSlug, pluginSlug), eq(migrationsLog.migrationName, fileName)));
  const row = rows[0];
  return row ? { checksum: String(row.checksum) } : null;
}

/**
 * Split a migration file into discrete SQL statements.
 *
 * Splits on:
 *   - `--> statement-breakpoint` markers emitted by drizzle-kit
 *   - `;` followed by optional whitespace and a newline (fallback for hand-written files)
 *
 * Strips `-- ...` line comments from each chunk before deciding whether it's
 * empty, so a statement preceded by a comment line still gets executed.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/--> statement-breakpoint|;[ \t]*\r?\n/g)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((s) => s.length > 0);
}

export async function applyMigrations(args: ApplyArgs): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], skipped: [], failures: [] };

  await ensureBootstrapTables(args.db);

  const lock = await acquireLock(args.db, { staleMs: args.staleMs ?? 5 * 60_000, owner: args.owner });
  if (!lock.acquired) {
    return { ...result, lockHeld: true, heldBy: lock.heldBy };
  }

  try {
    for (const plugin of args.plugins) {
      const migrations = discoverPluginMigrations({
        pluginSlug: plugin.slug,
        dir: plugin.migrationsDir
      });

      for (const m of migrations) {
        const prior = await alreadyApplied(args.db, m.pluginSlug, m.fileName);
        if (prior) {
          if (prior.checksum !== m.checksum) {
            result.failures.push({
              pluginSlug: m.pluginSlug,
              fileName: m.fileName,
              error: `checksum drift detected for ${m.pluginSlug}/${m.fileName} — recorded ${prior.checksum.slice(0, 8)}…, file now ${m.checksum.slice(0, 8)}…`
            });
            break;
          }
          result.skipped.push(m);
          continue;
        }

        const start = Date.now();
        try {
          for (const stmt of splitStatements(m.sql)) {
            await args.db.execute(stmt);
          }
          const elapsed = Date.now() - start;
          await drizzleLibSql(args.db).insert(migrationsLog).values({
            pluginSlug: m.pluginSlug,
            migrationName: m.fileName,
            appliedBy: args.appliedBy ?? null,
            executionMs: elapsed,
            checksum: m.checksum
          });
          result.applied.push(m);
        } catch (err) {
          result.failures.push({
            pluginSlug: m.pluginSlug,
            fileName: m.fileName,
            error: err instanceof Error ? err.message : String(err)
          });
          break;
        }
      }
    }
  } finally {
    await releaseLock(args.db);
  }

  return result;
}

export interface PlanArgs {
  db: DbClient;
  plugins: PluginMigrationSource[];
}

export interface PlanResult {
  pending: DiscoveredMigration[];
}

export async function planMigrations(args: PlanArgs): Promise<PlanResult> {
  await ensureBootstrapTables(args.db);
  const pending: DiscoveredMigration[] = [];
  for (const plugin of args.plugins) {
    const migs = discoverPluginMigrations({ pluginSlug: plugin.slug, dir: plugin.migrationsDir });
    for (const m of migs) {
      const prior = await alreadyApplied(args.db, m.pluginSlug, m.fileName);
      if (!prior) pending.push(m);
    }
  }
  return { pending };
}

export interface StatusResult {
  byPlugin: Record<string, { applied: DiscoveredMigration[]; pending: DiscoveredMigration[] }>;
}

export async function migrationStatus(args: PlanArgs): Promise<StatusResult> {
  await ensureBootstrapTables(args.db);
  const byPlugin: StatusResult["byPlugin"] = {};
  for (const plugin of args.plugins) {
    const migs = discoverPluginMigrations({ pluginSlug: plugin.slug, dir: plugin.migrationsDir });
    const applied: DiscoveredMigration[] = [];
    const pending: DiscoveredMigration[] = [];
    for (const m of migs) {
      const prior = await alreadyApplied(args.db, m.pluginSlug, m.fileName);
      if (prior) applied.push(m);
      else pending.push(m);
    }
    byPlugin[plugin.slug] = { applied, pending };
  }
  return { byPlugin };
}

export interface RollbackArgs {
  db: DbClient;
  pluginSlug: string;
  fileName: string;
}

export async function rollbackMigration(args: RollbackArgs): Promise<{ removed: boolean }> {
  await ensureBootstrapTables(args.db);
  const result = await drizzleLibSql(args.db)
    .delete(migrationsLog)
    .where(and(eq(migrationsLog.pluginSlug, args.pluginSlug), eq(migrationsLog.migrationName, args.fileName)));
  // drizzle-orm/libsql returns ResultSet-like; check rowsAffected
  const rowsAffected = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
  return { removed: rowsAffected > 0 };
}
