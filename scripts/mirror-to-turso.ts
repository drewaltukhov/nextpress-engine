/**
 * One-shot: mirror the local SQLite dev.db to the remote Turso DB.
 *
 * The standard sqlite3 `.dump` route hits "no such function: unistr"
 * on libSQL because SQLite 3.42+ emits `unistr(...)` wrappers around
 * non-ASCII text. This script bypasses dumps entirely — it reads the
 * schema from local `sqlite_master`, applies the CREATE statements on
 * the remote, then copies every row table-by-table using native
 * libSQL bound values (so BLOBs + Unicode pass through cleanly).
 *
 * Run:
 *   TURSO_REMOTE_URL=libsql://... \
 *   TURSO_REMOTE_TOKEN=$(turso db tokens create nextpress-dev) \
 *   npx tsx scripts/mirror-to-turso.ts
 */
import { createClient, type Client } from "@libsql/client";

const LOCAL_URL = "file:.local/dev.db";
const REMOTE_URL = process.env.TURSO_REMOTE_URL;
const REMOTE_TOKEN = process.env.TURSO_REMOTE_TOKEN;

if (!REMOTE_URL || !REMOTE_TOKEN) {
  console.error("Set TURSO_REMOTE_URL and TURSO_REMOTE_TOKEN.");
  process.exit(1);
}

// Guard against the LOCAL=REMOTE foot-gun: if someone aliases
// `TURSO_REMOTE_URL=$TURSO_DATABASE_URL` while the database URL still
// points at the local SQLite file (common in dev-only setups), the
// "wipe remote schema" step below would obliterate the local dev DB.
// A remote URL is always a libsql:// (or https://) — never a file path.
if (REMOTE_URL.startsWith("file:") || REMOTE_URL === LOCAL_URL) {
  console.error(
    `Refusing to mirror: TURSO_REMOTE_URL must be a remote libsql:// or https:// URL, not a local file path (got: ${REMOTE_URL}).`,
  );
  process.exit(1);
}

interface MasterRow {
  type: string;
  name: string;
  sql: string | null;
  tbl_name: string;
}

async function listMaster(c: Client, type: string): Promise<MasterRow[]> {
  const r = await c.execute(
    `SELECT type, name, sql, tbl_name FROM sqlite_master
       WHERE type = ?
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'libsql_%'
       ORDER BY rowid`,
    [type],
  );
  return r.rows.map((row) => ({
    type: String(row.type),
    name: String(row.name),
    sql: row.sql == null ? null : String(row.sql),
    tbl_name: String(row.tbl_name),
  }));
}

async function dropEverything(remote: Client, local: Client): Promise<void> {
  for (const kind of ["trigger", "view", "index"]) {
    const rows = await listMaster(remote, kind);
    for (const r of rows) {
      try {
        await remote.execute(`DROP ${kind.toUpperCase()} IF EXISTS "${r.name}"`);
      } catch {
        // Auto-created indexes for PKs/UNIQUEs are dropped by their table; tolerate.
      }
    }
  }
  // Tables last. `DROP TABLE` runs an implicit row DELETE, which fires
  // FK constraint checks — dropping a parent while a child still has
  // rows raises "FOREIGN KEY constraint failed". `PRAGMA foreign_keys =
  // OFF` can't fix this here: it is connection-scoped, and libSQL's
  // stateless HTTP protocol runs every `execute` on a fresh connection,
  // so the pragma never reaches the DROP statements.
  //
  // Two defences, applied together inside one batch (= one transaction):
  //   1. drop children before parents (reverse topological order), so a
  //      table is only ever dropped once nothing references it;
  //   2. `PRAGMA defer_foreign_keys = ON` — honoured for the lifetime of
  //      the enclosing transaction (the same trick `copyRows` relies on)
  //      — so any residual ref from a half-mirrored remote is checked
  //      only at COMMIT, by which point every table is gone.
  const tables = await listMaster(remote, "table");
  const tableNames = tables
    .map((t) => t.name)
    .filter((n) => !n.startsWith("__mirror_drop_"));

  if (tableNames.length > 0) {
    const order = await topologicalTableOrder(local, tableNames);
    await remote.batch(
      [
        { sql: "PRAGMA defer_foreign_keys = ON" },
        ...[...order]
          .reverse()
          .map((name) => ({ sql: `DROP TABLE IF EXISTS "${name}"` })),
      ],
      "write",
    );
  }

  // Sweep any leftover __mirror_drop_* scratch tables from older
  // rename-then-drop versions of this script that failed mid-run.
  const ghosts = await remote.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '\\_\\_mirror_drop_%' ESCAPE '\\'`
  );
  if (ghosts.rows.length > 0) {
    await remote.batch(
      [
        { sql: "PRAGMA defer_foreign_keys = ON" },
        ...ghosts.rows.map((row) => ({
          sql: `DROP TABLE IF EXISTS "${String(row.name)}"`,
        })),
      ],
      "write",
    );
  }
}

async function applySchema(remote: Client, local: Client): Promise<void> {
  // Tables first, then indexes, then triggers, then views — same
  // dependency order sqlite uses internally.
  for (const kind of ["table", "index", "trigger", "view"]) {
    const items = await listMaster(local, kind);
    for (const it of items) {
      if (!it.sql) continue;
      // Skip auto-generated indexes (their statement is null AND
      // they're created by the CREATE TABLE constraint anyway). The
      // `if (!it.sql) continue;` above already guards that case.
      try {
        await remote.execute(it.sql);
      } catch (err) {
        // PK/UNIQUE indexes can already exist via the CREATE TABLE
        // constraint — tolerate "already exists" but surface anything
        // else.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(msg)) {
          throw new Error(`Failed to apply ${kind} "${it.name}": ${msg}`);
        }
      }
    }
  }
}

async function copyRows(remote: Client, local: Client, table: string): Promise<number> {
  // Pull column list in declared order so SELECT and INSERT line up.
  const cols = await local.execute(`PRAGMA table_info("${table}")`);
  const colNames = cols.rows.map((r) => String(r.name));
  if (colNames.length === 0) return 0;

  const select = await local.execute(`SELECT * FROM "${table}"`);
  if (select.rows.length === 0) return 0;

  const insertSql = `INSERT INTO "${table}" (${colNames
    .map((c) => `"${c}"`)
    .join(", ")}) VALUES (${colNames.map(() => "?").join(", ")})`;

  // Each batch is its own transaction. `defer_foreign_keys = ON` lives
  // inside the batch's implicit transaction so self-referential FKs
  // commit cleanly. Cross-table FKs are satisfied by the topological
  // copy order set in main().
  const BATCH_SIZE = 100;
  let copied = 0;
  for (let i = 0; i < select.rows.length; i += BATCH_SIZE) {
    const chunk = select.rows.slice(i, i + BATCH_SIZE);
    const stmts: { sql: string; args?: never }[] = [
      { sql: "PRAGMA defer_foreign_keys = ON" },
    ];
    for (const row of chunk) {
      stmts.push({
        sql: insertSql,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: colNames.map((c) => (row as any)[c]) as never,
      });
    }
    await remote.batch(stmts, "write");
    copied += chunk.length;
  }
  return copied;
}

/**
 * Sort tables in topological order so child tables (those with FOREIGN
 * KEYs) come after their parents. Self-references are dropped from the
 * graph (rows in the same table can still violate FK on insert, but
 * `defer_foreign_keys = ON` in each batch covers that). Cycles are
 * broken by emitting the next "ready" node by name order — libSQL
 * surfaces an explicit error if a true cycle exists.
 */
async function topologicalTableOrder(local: Client, names: string[]): Promise<string[]> {
  const deps = new Map<string, Set<string>>();
  for (const name of names) deps.set(name, new Set());
  for (const name of names) {
    const fks = await local.execute(`PRAGMA foreign_key_list("${name}")`);
    for (const row of fks.rows) {
      const target = String(row.table);
      if (target !== name && deps.has(target)) {
        deps.get(name)!.add(target);
      }
    }
  }

  const out: string[] = [];
  const placed = new Set<string>();
  // Cap iterations so a missed cycle doesn't loop forever.
  for (let i = 0; i < names.length * names.length && out.length < names.length; i++) {
    for (const name of names) {
      if (placed.has(name)) continue;
      const remaining = [...deps.get(name)!].filter((d) => !placed.has(d));
      if (remaining.length === 0) {
        out.push(name);
        placed.add(name);
      }
    }
  }
  // Anything left over (a cycle) — append in arbitrary order; the
  // per-batch `defer_foreign_keys = ON` will let cyclic refs commit.
  for (const name of names) if (!placed.has(name)) out.push(name);
  return out;
}

async function main() {
  console.log("[mirror] connecting…");
  const local = createClient({ url: LOCAL_URL });
  const remote = createClient({ url: REMOTE_URL!, authToken: REMOTE_TOKEN });

  console.log("[mirror] wiping remote schema…");
  await dropEverything(remote, local);

  console.log("[mirror] applying local schema to remote…");
  await applySchema(remote, local);

  console.log("[mirror] copying rows…");
  // Copy tables in topological FK order — parents first, then
  // children. With self-referential FKs handled by per-batch
  // `defer_foreign_keys = ON`, no single big transaction is needed
  // (which avoids libSQL HTTP transaction idle timeouts on large
  // tables).
  const tables = await listMaster(local, "table");
  const order = await topologicalTableOrder(local, tables.map((t) => t.name));
  let total = 0;
  for (const name of order) {
    const n = await copyRows(remote, local, name);
    if (n > 0) {
      console.log(`[mirror]   ${name}: ${n} row(s)`);
      total += n;
    }
  }
  console.log(`[mirror] done — ${total} row(s) across ${tables.length} table(s)`);

  // Optional: purge the deployed site's Next.js route + tag cache so
  // a refresh shows the freshly-mirrored data immediately (otherwise
  // Vercel keeps serving stale HTML up to its `revalidate` window).
  // Both vars must be set; either missing → skip with a hint.
  const purgeUrl = process.env.CACHE_PURGE_URL;
  const purgeToken = process.env.CACHE_PURGE_TOKEN;
  if (purgeUrl && purgeToken) {
    console.log("[mirror] purging deployed cache…");
    try {
      const res = await fetch(purgeUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${purgeToken}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { revalidated?: { tags?: string[] } };
        const tagCount = body.revalidated?.tags?.length ?? 0;
        console.log(`[mirror] cache purged — ${tagCount} tag(s) + root layout`);
      } else {
        console.error(`[mirror] cache purge failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[mirror] cache purge errored:`, err instanceof Error ? err.message : err);
    }
  } else {
    console.log(
      "[mirror] skipping cache purge — set CACHE_PURGE_URL + CACHE_PURGE_TOKEN to wire it in.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
