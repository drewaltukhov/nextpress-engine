/**
 * libSQL Client facade that proxies to Drizzle Postgres.
 *
 * Phase 2 makes the app actually work end-to-end against Supabase. ~580 call
 * sites in NextPress use the synchronous `db()` libSQL client. Converting them
 * all to `await dbAdmin()` would take days. The facade is a pragmatic bridge:
 * it implements the `@libsql/client` Client interface (the subset NextPress
 * uses) but every call routes through a postgres-js `Sql` pool initialized
 * from `DATABASE_URL`.
 *
 * Three concerns the facade handles:
 *
 *   1. **Placeholder translation.** libSQL uses `?`; Postgres uses `$1, $2, …`
 *      Numbered substitution happens in `translateSql`.
 *
 *   2. **SQLite dialect-isms.** A small set of SQLite-specific syntactic
 *      sugar is rewritten to Postgres equivalents (`INSERT OR IGNORE` →
 *      `… ON CONFLICT DO NOTHING`; `datetime('now')` → `now()`). The list
 *      is intentionally short — anything else surfaces as a runtime error,
 *      which is the prompt to convert that call site to `await dbAdmin()`.
 *
 *   3. **Row shape.** libSQL returns rows that allow both array-index AND
 *      column-name access (`r.rows[0][0]` and `r.rows[0].col` both work).
 *      Postgres-js returns objects keyed by name. The facade re-wraps rows
 *      via a Proxy so both access patterns work.
 */
import postgres, { type Sql } from "postgres";

export interface InStatement {
  sql: string;
  args?: unknown[];
}

export interface FacadeRow {
  [index: number]: unknown;
  [columnName: string]: unknown;
  length: number;
}

export interface FacadeResultSet {
  columns: string[];
  rows: FacadeRow[];
  rowsAffected: number;
  lastInsertRowid: bigint | undefined;
}

// Columns that NextPress schemas declared as boolean in Postgres. SQLite-side
// Drizzle emits integer literals (0/1) for these in upserts; Postgres rejects
// the int → boolean coercion. We rewrite the literals inline.
const BOOLEAN_COLUMNS = new Set([
  "enabled",
  "autoload",
  "encrypted",
  "active",
  "diff_truncated",
  "seo_exclude_from_sitemap",
]);

function translateSql(sqlText: string): string {
  let out = sqlText;

  // 1. Placeholders: `?` (positional) → `$1, $2, …`
  // Safe under NextPress's SQL — placeholders never appear inside string literals.
  let n = 0;
  out = out.replace(/\?/g, () => `$${++n}`);

  // 2. INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING (SQLite → pg).
  if (/INSERT OR IGNORE INTO/i.test(sqlText) && !/ON CONFLICT/i.test(sqlText)) {
    out = out.replace(/\bINSERT OR IGNORE INTO\b/gi, "INSERT INTO");
    out = out.trimEnd().replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
  } else {
    out = out.replace(/\bINSERT OR IGNORE INTO\b/gi, "INSERT INTO");
  }

  // 3. ON CONFLICT ("table"."col") → ON CONFLICT ("col")
  // Drizzle's libSQL query builder emits schema-qualified conflict targets,
  // which Postgres rejects ("syntax error at or near ')'").
  out = out.replace(
    /ON CONFLICT \(\s*"[^"]+"\."([^"]+)"\s*\)/gi,
    'ON CONFLICT ("$1")'
  );

  // 4. SQLite datetime() → Postgres timestamptz expression.
  //
  // All NextPress timestamp columns on the Postgres side are TIMESTAMPTZ
  // (TEXT timestamp columns were migrated during Phase 2 setup), so
  // emitting `now()` / `($N::timestamptz + INTERVAL …)` resolves cleanly
  // for any `column > datetime(...)` comparison.
  //
  // Forms observed in the codebase:
  //   datetime('now')               → now()
  //   datetime('now', '-30 days')   → (now() + INTERVAL '-30 days')
  //   datetime('now', ?)            → (now() + ($N::interval))
  //   datetime(?, '+1 day')         → ($N::timestamptz + INTERVAL '+1 day')
  const dtArg = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^'now'$/i.test(trimmed)) return "now()";
    if (/^\$\d+$/.test(trimmed)) return `${trimmed}::timestamptz`;
    return trimmed;
  };
  const dtInterval = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return `INTERVAL ${trimmed}`;
    if (/^\$\d+$/.test(trimmed)) return `(${trimmed}::interval)`;
    return `INTERVAL ${trimmed}`;
  };
  // Two-arg form first (so the single-arg regex below doesn't swallow it).
  out = out.replace(
    /\bdatetime\(\s*('[^']*'|\$\d+)\s*,\s*('[^']*'|\$\d+)\s*\)/gi,
    (_m, a, b) => `(${dtArg(a)} + ${dtInterval(b)})`
  );
  out = out.replace(
    /\bdatetime\(\s*('[^']*'|\$\d+)\s*\)/gi,
    (_m, a) => `${dtArg(a)}`
  );

  // 4a. SQLite GROUP_CONCAT(expr) → Postgres STRING_AGG(expr::text, ',').
  // NextPress only uses the single-arg form (default ',' separator). Cast to
  // text covers non-text column types (most call sites pass a slug-like text
  // column already, but the cast is harmless).
  out = out.replace(
    /\bGROUP_CONCAT\(\s*([^()]+?)\s*\)/gi,
    "STRING_AGG($1::text, ',')"
  );

  // 4b. SQLite `COLLATE NOCASE` → Postgres `LOWER(<expr>)`.
  // Used throughout NextPress for case-insensitive alphabetical sort. Postgres
  // lacks NOCASE collation; we wrap the preceding expression in LOWER() so the
  // ORDER BY semantics match. Matches a bare identifier, qualified identifier,
  // or simple function-call (no nested parens — the only NextPress usage of
  // this kind is COALESCE(u.display_name, u.email)).
  out = out.replace(
    /(\w+(?:\.\w+)?|\w+\s*\([^()]*\))\s+COLLATE\s+NOCASE/gi,
    "LOWER($1)"
  );

  // 5. Integer-literal boolean coercion in SET / WHERE clauses.
  // Drizzle's libSQL builder emits `"enabled" = 1` for boolean updates; pg
  // requires `true` / `false`. Rewrite only for columns declared boolean in
  // the pgTable schemas (see BOOLEAN_COLUMNS).
  for (const col of BOOLEAN_COLUMNS) {
    const colPattern = new RegExp(`("?${col}"?)\\s*=\\s*([01])\\b`, "gi");
    out = out.replace(colPattern, (_match, colRef, lit) => `${colRef} = ${lit === "1" ? "true" : "false"}`);
    // Also handle the pattern in VALUES (...) where a boolean column gets 0/1.
    // The above won't catch a positional ?-placeholder once bound — args
    // arrive as JS numbers and postgres-js will coerce based on column type
    // metadata, so VALUES side is generally fine.
  }

  return out;
}

function makeRowProxy(record: Record<string, unknown>, columns: string[]): FacadeRow {
  // Build a row that behaves correctly for both index access (`row[0]`) and
  // name access (`row.checksum`).
  //
  // Earlier this used a Proxy. The Proxy approach broke under Drizzle's libSQL
  // session because `Array.prototype.slice.call(proxy)` uses `HasProperty`
  // *before* `Get` — and a Proxy without a `has` trap delegates to the target.
  // The target is the raw postgres-js record (`{ checksum: 'abc' }`), which
  // doesn't have property `"0"`, so slice produced an array of holes,
  // `.map(normalizeFieldValue)` skipped those holes, and Drizzle saw
  // `checksum: undefined` for every row — the "checksum drift detected" noise.
  //
  // Real arrays return true for HasProperty on valid indices, so we build an
  // array indexed by column order and attach the column-name properties
  // afterward. Both forms now resolve to the actual value.
  const row = columns.map((col) => coerceForLibsqlConsumers(record[col])) as unknown as FacadeRow;
  for (const col of columns) {
    if (!(col in row)) {
      (row as Record<string, unknown>)[col] = coerceForLibsqlConsumers(record[col]);
    }
  }
  return row;
}

/**
 * Match the value shapes raw `db.execute()` consumers expect on the libSQL
 * path. The 580+ call sites were written against SQLite, where:
 *   - TIMESTAMPTZ → ISO string (postgres-js returns Date by default)
 *   - BIGINT     → number (postgres-js returns string by default)
 * `String(date)` from `rowToListItem`-style mappers produces a Date.toString
 * format that breaks lex-sortable ordering and `.localeCompare` callers.
 * Coercing at the facade boundary keeps the rest of the codebase ignorant
 * of which dialect is underneath.
 */
function coerceForLibsqlConsumers(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") {
    // NextPress doesn't have ids > 2^53; safe to downcast for SQLite parity.
    return Number(value);
  }
  return value;
}

export interface LibSqlFacadeOnPgConfig {
  url: string;
  max?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

/**
 * Re-throw a query failure with diagnostic info structured for Vercel log
 * shipping. Vercel's runtime-log API only surfaces the first line of an
 * error's message in its log-message field, so we put the most useful info
 * (SQL prefix + postgres error) on line one and also `console.error` the
 * full multi-line context so the stderr log carries the unabbreviated SQL.
 */
function rethrowFacadeQueryError(
  err: unknown,
  sqlText: string,
  translated: string
): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  const where = (err as { where?: string })?.where;
  const oneLineSql = sqlText.replace(/\s+/g, " ").trim();
  const sqlPreview = oneLineSql.length > 200 ? oneLineSql.slice(0, 200) + "…" : oneLineSql;
  const codeTag = code ? ` [${code}]` : "";
  // Single-line message — survives Vercel log truncation.
  const headline = `LibSqlFacadeOnPg: query failed${codeTag}: ${msg} | SQL: ${sqlPreview}`;
  // Full context to stderr — Vercel captures this on a separate log line.
  console.error(
    "[facade-error] query failed\n" +
      `  code: ${code ?? "(none)"}\n` +
      (where ? `  where: ${where}\n` : "") +
      `  original SQL: ${sqlText}\n` +
      `  translated:   ${translated}\n` +
      `  postgres error: ${msg}`
  );
  return new Error(headline);
}

/**
 * Implements enough of the `@libsql/client` Client interface for NextPress's
 * existing call sites to work unchanged against a Postgres backend.
 */
const PROFILE = process.env.NEXTPRESS_FACADE_PROFILE === "1";

export class LibSqlFacadeOnPg {
  readonly closed = false;
  readonly protocol = "facade-pg";
  private readonly sqlClient: Sql;
  private profileCount = 0;
  private profileTotalMs = 0;
  private profileByPrefix = new Map<string, { n: number; ms: number }>();

  constructor(config: LibSqlFacadeOnPgConfig) {
    this.sqlClient = postgres(config.url, {
      // max=4 paired with the Supavisor transaction-mode pooler (port 6543).
      // Transaction mode multiplexes client connections at the statement
      // level, so the effective free-tier limit is ~200, not 15. Keeping
      // max=4 leaves headroom for parallel reads inside a single request
      // (page render fans out a few SELECTs) without forcing them through
      // a single connection — that path deadlocks Drizzle's libSQL adapter.
      max: config.max ?? 4,
      idle_timeout: config.idleTimeout ?? 30,
      connect_timeout: config.connectTimeout ?? 30,
      // Required for Supavisor transaction-mode (port 6543); also fine on
      // session-mode and direct host.
      prepare: false,
      ssl: "require",
    });
  }

  /** Match `Client.execute(stmt)` — accepts string or InStatement. */
  async execute(stmt: string | InStatement): Promise<FacadeResultSet> {
    const sqlText = typeof stmt === "string" ? stmt : stmt.sql;
    const args = typeof stmt === "string" ? [] : (stmt.args ?? []);
    // SQLite PRAGMA isn't valid Postgres syntax. Most NextPress PRAGMA uses
    // are introspection / advisory (page_count, page_size, freelist_count,
    // defer_foreign_keys). Return an empty result so callers that don't
    // branch on provider don't crash; provider-aware callers (e.g.
    // getDbSizeBytes) handle Supabase explicitly.
    if (/^\s*PRAGMA\b/i.test(sqlText)) {
      return { columns: [], rows: [], rowsAffected: 0, lastInsertRowid: undefined };
    }
    const translated = translateSql(sqlText);
    const t0 = PROFILE ? performance.now() : 0;
    try {
      const result = await this.sqlClient.unsafe(translated, args as never[]);
      if (PROFILE) {
        const dt = performance.now() - t0;
        this.profileCount += 1;
        this.profileTotalMs += dt;
        const prefix = sqlText.trim().slice(0, 80).replace(/\s+/g, " ");
        const cur = this.profileByPrefix.get(prefix) ?? { n: 0, ms: 0 };
        cur.n += 1; cur.ms += dt;
        this.profileByPrefix.set(prefix, cur);
        if (this.profileCount % 100 === 0) {
          console.log(`[facade-profile] ${this.profileCount} queries, ${this.profileTotalMs.toFixed(0)}ms total, avg ${(this.profileTotalMs / this.profileCount).toFixed(2)}ms`);
          const top = Array.from(this.profileByPrefix.entries())
            .sort((a, b) => b[1].ms - a[1].ms)
            .slice(0, 5);
          for (const [prefix, s] of top) {
            console.log(`[facade-profile]   ${s.n.toString().padStart(4)}× ${s.ms.toFixed(0).padStart(6)}ms  ${prefix}`);
          }
        }
      }
      // postgres-js result has `.columns` metadata and is iterable as records
      const records = Array.from(result) as Record<string, unknown>[];
      const columns = result.columns?.map((c) => c.name) ?? Object.keys(records[0] ?? {});
      const rows = records.map((r) => makeRowProxy(r, columns));
      // postgres-js exposes `count` for rowsAffected when applicable
      const rowsAffected = (result as unknown as { count?: number }).count ?? rows.length;
      return {
        columns,
        rows,
        rowsAffected,
        lastInsertRowid: undefined,
      };
    } catch (err) {
      throw rethrowFacadeQueryError(err, sqlText, translated);
    }
  }

  /** Match `Client.batch(stmts, mode?)` — runs in a single transaction. */
  async batch(stmts: InStatement[], _mode?: string): Promise<FacadeResultSet[]> {
    const results: FacadeResultSet[] = [];
    await this.sqlClient.begin(async (tx) => {
      for (const stmt of stmts) {
        const translated = translateSql(stmt.sql);
        const args = stmt.args ?? [];
        try {
          const result = await tx.unsafe(translated, args as never[]);
          const records = Array.from(result) as Record<string, unknown>[];
          const columns = result.columns?.map((c) => c.name) ?? Object.keys(records[0] ?? {});
          const rows = records.map((r) => makeRowProxy(r, columns));
          const rowsAffected = (result as unknown as { count?: number }).count ?? rows.length;
          results.push({
            columns,
            rows,
            rowsAffected,
            lastInsertRowid: undefined,
          });
        } catch (err) {
          throw rethrowFacadeQueryError(err, stmt.sql, translated);
        }
      }
    });
    return results;
  }

  /** Match `Client.executeMultiple(sql)` — runs raw multi-statement SQL. */
  async executeMultiple(sql: string): Promise<void> {
    const translated = translateSql(sql);
    try {
      await this.sqlClient.unsafe(translated);
    } catch (err) {
      throw rethrowFacadeQueryError(err, sql, translated);
    }
  }

  /** Match `Client.close()`. postgres-js's `.end()` is async; libSQL's `.close()` is sync. */
  close(): void {
    void this.sqlClient.end({ timeout: 5 });
  }

  /** Match `Client.sync()`. No-op for Postgres. */
  async sync(): Promise<void> {
    // no-op
  }

  /** Get the underlying postgres-js client — used by drizzle-orm/postgres-js. */
  getPgClient(): Sql {
    return this.sqlClient;
  }
}
