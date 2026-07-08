/**
 * Database importer — restores table data from a backup archive.
 *
 * Drops all rows from each table and re-inserts from the backup.
 * Wrapped in a transaction for all-or-nothing semantics.
 */
import type { DbClient } from "@core/db/client";
import type { BackupProvider } from "./manifest";

/**
 * Discover which columns of `table` are binary (BLOB on libSQL, bytea on PG).
 *
 * Needed because the exporter serializes binary values as base64 strings for
 * JSON portability. When inserting back, we have to decode those strings to
 * Buffers — otherwise the driver stores the base64 text in the BLOB column
 * as TEXT (SQLite's type affinity is loose) and downstream consumers serve
 * the base64 string verbatim instead of bytes.
 */
async function discoverBlobColumns(
  db: DbClient,
  table: string,
  provider: BackupProvider
): Promise<Set<string>> {
  if (!/^[A-Za-z0-9_]+$/.test(table)) {
    throw new Error(`Refusing PRAGMA table_info for unsafe table name: ${table}`);
  }

  if (provider === "supabase") {
    const result = await db.execute({
      sql: `SELECT column_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = ?
               AND data_type = 'bytea'`,
      args: [table],
    });
    return new Set(result.rows.map((r) => String(r.column_name)));
  }

  // libSQL / turso: PRAGMA table_info does not accept bound parameters
  const result = await db.execute({
    sql: `PRAGMA table_info("${table}")`,
    args: [],
  });
  const blobs = new Set<string>();
  for (const row of result.rows) {
    if (String((row as Record<string, unknown>).type).toUpperCase() === "BLOB") {
      blobs.add(String((row as Record<string, unknown>).name));
    }
  }
  return blobs;
}

/**
 * Restore all tables from backup data.
 *
 * For each table in the backup: DELETE all existing rows, then INSERT
 * the backup rows. Uses batch execution for performance.
 *
 * Provider-aware:
 *   - libSQL: PRAGMA defer_foreign_keys parks FK enforcement until COMMIT.
 *   - Postgres: SET CONSTRAINTS ALL DEFERRED for the equivalent effect;
 *     after the bulk insert finishes, serial sequences are bumped to
 *     MAX(id) so the next normal INSERT doesn't collide with restored ids.
 *
 * @param db - Database client
 * @param data - Map of table name → array of row objects
 * @param provider - Current DB provider (must match backup; checked upstream)
 * @param opts - Optional restore options
 * @param opts.includeMedia - When true, restore the `media` table (default: false).
 *   Off by default: the exporter drops media (blob-heavy + dedicated archive flow),
 *   and old backups that happen to carry media rows must not silently overwrite the
 *   live media table with rows whose blobs were lost long ago. Opt-in via this flag
 *   for the demo-content restore path where media rows are known-good.
 */
export async function restoreDatabase(
  db: DbClient,
  data: Record<string, Record<string, unknown>[]>,
  provider: BackupProvider,
  opts: { includeMedia?: boolean } = {}
): Promise<{ tablesRestored: number; rowsRestored: number }> {
  // Skip set: `migration_lock` is always ephemeral. `media` is normally
  // off-limits (we don't want a stale backup blowing away the live media
  // table) — opt-in via includeMedia for the demo restore path.
  const skip = new Set<string>(["migration_lock"]);
  if (!opts.includeMedia) skip.add("media");

  let tablesRestored = 0;
  let rowsRestored = 0;

  // FK deferral: libSQL has PRAGMA defer_foreign_keys; Postgres uses
  // SET CONSTRAINTS ALL DEFERRED inside the same transaction. But pg's
  // SET CONSTRAINTS only affects constraints declared DEFERRABLE — Drizzle
  // emits non-deferrable FKs by default, so we one-time-flip every FK in the
  // public schema to DEFERRABLE INITIALLY IMMEDIATE before opening the
  // transaction. The change is idempotent and behaves identically to a
  // non-deferrable FK for normal queries.
  if (provider === "supabase") {
    await ensureFksAreDeferrable(db);
  }
  const fkDeferStmt =
    provider === "supabase"
      ? "SET CONSTRAINTS ALL DEFERRED"
      : "PRAGMA defer_foreign_keys = ON";

  const deletes: { sql: string; args: unknown[] }[] = [];
  const inserts: { sql: string; args: unknown[] }[] = [];

  // Track tables that may have serial-backed id columns on Postgres so we can
  // reset sequences after bulk insert. We do this for every restored table on
  // PG and let pg_get_serial_sequence return NULL for non-serial tables (the
  // setval is then skipped).
  const restoredTables: string[] = [];

  // Pass 1: queue every DELETE first so that ON DELETE CASCADE actions
  // fire against an empty target instead of against rows we just inserted.
  // The iteration of `Object.entries(data)` is alphabetical, so a child table
  // (e.g. `menu_items`) is otherwise processed before its parent (`menus`);
  // when the parent later deletes, its cascade wipes the child we restored.
  // PRAGMA defer_foreign_keys defers FK *checks* at commit but does NOT
  // defer CASCADE actions, so this ordering is the only correct fix.
  for (const [table, rows] of Object.entries(data)) {
    if (skip.has(table)) continue;
    if (!Array.isArray(rows)) continue;

    // Quoted table name protects reserved words / mixed case on both engines.
    deletes.push({ sql: `DELETE FROM "${table}"`, args: [] });

    // Discover BLOB columns so base64-encoded values from the exporter are
    // decoded back to Buffers before binding. Without this the libSQL driver
    // stores the raw base64 string as TEXT (SQLite type affinity is loose).
    const blobCols = await discoverBlobColumns(db, table, provider);

    for (const row of rows) {
      const keys = Object.keys(row);
      if (keys.length === 0) continue;

      const placeholders = keys.map(() => "?").join(", ");
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const values = keys.map((k) => {
        const v = row[k] ?? null;
        if (v !== null && blobCols.has(k) && typeof v === "string") {
          // Base64-encoded blob from the exporter — decode back to bytes.
          return Buffer.from(v, "base64");
        }
        return v;
      });

      inserts.push({
        sql: `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
        args: values,
      });
      rowsRestored++;
    }

    restoredTables.push(table);
    tablesRestored++;
  }

  const stmts: { sql: string; args: unknown[] }[] = [
    { sql: fkDeferStmt, args: [] },
    ...deletes,
    ...inserts,
  ];

  // Execute everything in a single batch transaction.
  await db.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args as (string | number | null)[] })),
    "write"
  );

  // Postgres sequence reset: after restoring rows with explicit ids, the
  // serial sequence still points at its pre-restore high-water mark. The next
  // INSERT without an explicit id would collide. Discover which restored
  // tables have a sequence-backed `id` column, then setval each one to MAX(id).
  if (provider === "supabase") {
    await resetSerialSequences(db, restoredTables);
  }

  return { tablesRestored, rowsRestored };
}

/**
 * Discover every FK constraint in the public schema and ALTER each one to be
 * DEFERRABLE INITIALLY IMMEDIATE. This is a one-time, idempotent flip per
 * constraint — once deferrable, the constraint behaves exactly like a regular
 * non-deferrable FK until a transaction explicitly issues SET CONSTRAINTS …
 * DEFERRED. Required because Drizzle's pg builder emits non-deferrable FKs.
 */
async function ensureFksAreDeferrable(db: DbClient): Promise<void> {
  let constraints: { table: string; constraint: string }[] = [];
  try {
    const result = await db.execute({
      sql: `SELECT conrelid::regclass::text AS table, conname AS constraint
              FROM pg_constraint c
              JOIN pg_namespace n ON n.oid = c.connamespace
             WHERE n.nspname = 'public'
               AND c.contype = 'f'
               AND NOT c.condeferrable`,
      args: [],
    });
    constraints = result.rows.map((r) => ({
      table: String(r.table),
      constraint: String(r.constraint),
    }));
  } catch {
    // If discovery fails (permissions, missing catalog views) the restore
    // will likely fail at insert time with a clearer FK message. Don't block.
    return;
  }
  for (const { table, constraint } of constraints) {
    try {
      // table comes back already quoted by ::regclass for reserved words —
      // splice the constraint name in directly.
      await db.execute({
        sql: `ALTER TABLE ${table} ALTER CONSTRAINT "${constraint}" DEFERRABLE INITIALLY IMMEDIATE`,
        args: [],
      });
    } catch {
      // Best-effort per constraint — one quirky FK shouldn't block the rest.
    }
  }
}

/**
 * For each table that has a sequence-backed `id` column, bump the sequence's
 * current value to MAX(id) so the next default-id INSERT doesn't collide.
 * Tables without a serial id (UUID PKs, composite PKs, etc.) are skipped.
 * Each setval is wrapped in try/catch so one weird table can't tank the rest.
 */
async function resetSerialSequences(db: DbClient, tables: string[]): Promise<void> {
  for (const table of tables) {
    let seqName: string | null = null;
    try {
      // pg_get_serial_sequence returns NULL when the column has no sequence
      // (UUID PK, non-`id` PK, no PK). The argument is a regclass-style name,
      // schema-qualified so reserved tablenames resolve unambiguously.
      const seqResult = await db.execute({
        sql: `SELECT pg_get_serial_sequence('public."${table}"', 'id') AS seq`,
        args: [],
      });
      const seqVal = seqResult.rows[0]?.seq;
      if (typeof seqVal === "string" && seqVal.length > 0) seqName = seqVal;
    } catch {
      // pg_get_serial_sequence can throw on missing tables / column lookup;
      // treat as "no sequence" and skip.
    }
    if (!seqName) continue;

    try {
      // setval(seq, value, is_called=true) sets the sequence's last-used value.
      // GREATEST(...) keeps the sequence at >= 1 even if the table is empty
      // (setval requires value >= 1).
      await db.execute({
        sql: `SELECT setval(
                '${seqName}',
                GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1),
                (SELECT COUNT(*) > 0 FROM "${table}")
              )`,
        args: [],
      });
    } catch {
      // Best-effort.
    }
  }
}
