/**
 * Database exporter — reads all table data as JSON objects.
 *
 * Used by the backup download route to build the .npbackup archive.
 *
 * Tables are discovered from the dialect's catalog (sqlite_master on libSQL,
 * pg_catalog.pg_tables on Postgres) so any future table — core, core-plugin,
 * or third-party plugin — is picked up automatically. The only tables ever
 * skipped are the ones in EXCLUDED_TABLES below.
 */
import { createHash } from "node:crypto";
import type { DbClient } from "@core/db/client";
import type { BackupManifest, BackupProvider } from "./manifest";

/**
 * Tables that should NEVER ride along in the .npbackup archive.
 *
 * - `media`: blob-heavy and has its own dedicated "Backup Media" archive
 *   (`/api/admin/backup/media/download`). Mixing it in here would bloat
 *   the file and double-store the same bytes.
 * - `migration_lock`: ephemeral row-locking state used by the migration
 *   runner; restoring an old value would just confuse the next run.
 */
const EXCLUDED_TABLES = new Set<string>(["media", "migration_lock"]);

/**
 * Tables classified as activity logs. These are excluded from a backup
 * unless the user opts in via "Include activity logs". Anything not in
 * this list and not in EXCLUDED_TABLES is treated as core data and
 * always included.
 */
const LOG_TABLES = new Set<string>([
  "system_log",
  "failed_jobs",
  "failed_logins",
  "plugin_failures",
]);

export interface ExportResult {
  data: Record<string, Record<string, unknown>[]>;
  manifest: BackupManifest;
}

async function discoverTables(db: DbClient, provider: BackupProvider): Promise<string[]> {
  if (provider === "supabase") {
    const result = await db.execute({
      sql: `SELECT tablename AS name
              FROM pg_catalog.pg_tables
             WHERE schemaname = 'public'
             ORDER BY tablename`,
      args: [],
    });
    return result.rows.map((r) => String(r.name));
  }
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
    args: [],
  });
  return result.rows.map((r) => String(r.name));
}

/**
 * Normalize a column value into a JSON-safe primitive so the row survives a
 * JSON.stringify → JSON.parse round trip with the same insert semantics on
 * both backends.
 *
 * - Postgres TIMESTAMPTZ comes through as a Date (the facade already coerces
 *   to ISO; this is a belt-and-braces fallback for any direct PG path).
 * - Postgres JSONB comes through as a JS object/array. Stringifying makes the
 *   value a JSON literal that PG re-parses on INSERT, and is harmless TEXT on
 *   libSQL where the same column is just TEXT.
 * - Buffers / typed arrays only arrive for blob columns (media is excluded);
 *   any straggler is base64-encoded so it doesn't crash JSON serialization.
 */
function flattenValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Binary columns can arrive in several shapes depending on the driver:
  //   - @libsql/client returns BLOBs as ArrayBuffer
  //   - The PG facade returns bytea as Node Buffer
  //   - Some paths surface plain Uint8Array (views over an ArrayBuffer)
  //   - Legacy/test paths may pass Array<number>
  // We normalize all of them to a base64 string so JSON round-trips
  // preserve the bytes and the importer's INSERT statement re-hydrates
  // them as the dialect's native binary type.
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value)).toString("base64");
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return Buffer.from(value as Uint8Array).toString("base64");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export interface ExportOptions {
  includeLogs: boolean;
  version: string;
  provider: BackupProvider;
  /** When true, the `media` table is included in the bundle with `blob_data`
   *  base64-encoded through the existing flattenValue path. Default false. */
  includeMedia?: boolean;
  /** Additional tables to omit from the bundle. Merged with EXCLUDED_TABLES.
   *  Used by the demo snapshot generator to drop auth + log tables. */
  extraExcludes?: ReadonlySet<string>;
  /** Optional per-row filter, evaluated inside the export loop — before row
   *  counts, totalRows, and the checksum are computed — so the manifest stays
   *  consistent with the emitted data. Return `false` to drop the row. Used by
   *  the demo snapshot to redact encrypted settings without shipping secrets.
   *  Omitted by the admin backup path, which keeps every row. */
  includeRow?: (table: string, row: Record<string, unknown>) => boolean;
}

/**
 * Export all tables from the database.
 *
 * Each table is exported as an array of row objects. The result includes
 * a manifest with row counts and a SHA-256 checksum.
 */
export async function exportDatabase(
  db: DbClient,
  opts: ExportOptions
): Promise<ExportResult> {
  const all = await discoverTables(db, opts.provider);

  // Build the effective exclude set: hard-coded + caller-supplied, minus
  // `media` when the caller has explicitly opted it in.
  const exclude = new Set<string>([...EXCLUDED_TABLES, ...(opts.extraExcludes ?? [])]);
  if (opts.includeMedia) exclude.delete("media");

  const tables = all
    .filter((t) => !exclude.has(t))
    .filter((t) => opts.includeLogs || !LOG_TABLES.has(t));

  const data: Record<string, Record<string, unknown>[]> = {};
  let totalRows = 0;
  const tableCounts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = await db.execute({
        sql: `SELECT * FROM "${table}"`,
        args: [],
      });
      // Iterate by column metadata, not Object.entries, so the facade row
      // (which is an Array with attached column-name properties) doesn't
      // emit each value twice — once under its numeric index, once under
      // its name. result.columns is present on both the real libSQL Client
      // and the facade.
      const columns = result.columns;
      const mapped = result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          obj[col] = flattenValue((row as Record<string, unknown>)[col]);
        }
        return obj;
      });
      // Row-level redaction (demo snapshot). Applied here so tableCounts,
      // totalRows, and the checksum below all reflect the redacted set.
      const rows = opts.includeRow
        ? mapped.filter((row) => opts.includeRow!(table, row))
        : mapped;
      data[table] = rows;
      tableCounts[table] = rows.length;
      totalRows += rows.length;
    } catch {
      // Pre-flight discovery already filtered to existing tables, so a
      // failure here is a real read error — record an empty table and
      // keep going so one bad table doesn't tank the whole archive.
      data[table] = [];
      tableCounts[table] = 0;
    }
  }

  // Compute checksum over all table data for integrity verification.
  const hash = createHash("sha256");
  for (const table of tables) {
    hash.update(JSON.stringify(data[table]));
  }
  const checksum = hash.digest("hex");

  const manifest: BackupManifest = {
    engine: "nextpress",
    version: opts.version,
    createdAt: new Date().toISOString(),
    tables: tableCounts,
    totalRows,
    includesLogs: opts.includeLogs,
    includesMedia: opts.includeMedia ?? false,
    checksum,
    provider: opts.provider,
  };

  return { data, manifest };
}
