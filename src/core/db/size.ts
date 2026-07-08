import type { DbClient } from "./client";
import { readEnv } from "@core/env";

/**
 * Bytes actually in use by the database.
 *
 * libSQL / SQLite: `(page_count - freelist_count) * page_size`. SQLite
 * holds onto pages from deleted rows (BLOB-heavy tables like `media` are
 * the usual offender) and only releases them on VACUUM, so the raw
 * on-disk file size routinely runs 5–20× the real content size.
 * Reporting in-use bytes matches what Turso bills against and what the
 * user perceives as "data stored".
 *
 * Postgres / Supabase: sum of `pg_total_relation_size` over the `public`
 * schema only. `pg_database_size()` would include ~10 MB of Postgres
 * system catalogs plus Supabase's `auth` / `storage` / `realtime` /
 * `vault` schemas — none of which are NextPress data. The public-schema
 * sum is the apples-to-apples equivalent of the SQLite measurement.
 */
export async function getDbSizeBytes(db: DbClient): Promise<number> {
  if (readEnv().provider === "supabase") {
    const r = await db.execute({
      sql: `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`,
      args: [],
    });
    return Number(r.rows[0]?.bytes ?? 0);
  }
  const [pageCount, pageSize, freelist] = await Promise.all([
    db.execute({ sql: "PRAGMA page_count", args: [] }),
    db.execute({ sql: "PRAGMA page_size", args: [] }),
    db.execute({ sql: "PRAGMA freelist_count", args: [] }),
  ]);
  const pc = Number(pageCount.rows[0]?.page_count ?? 0);
  const ps = Number(pageSize.rows[0]?.page_size ?? 0);
  const fl = Number(freelist.rows[0]?.freelist_count ?? 0);
  return Math.max(0, (pc - fl) * ps);
}

/** Compact human-readable byte formatter — "12.3 MB", "4 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}
