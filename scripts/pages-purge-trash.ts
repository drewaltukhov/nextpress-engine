/**
 * Permanently delete trashed pages older than N days. Mirrors the
 * `scripts/logs-prune.ts` CLI pattern — host environment is responsible
 * for scheduling (cron, Vercel Cron, etc.). The script itself is a
 * one-shot job that exits with rowsAffected.
 *
 * Default cutoff is 30 days. Override with `--days=<n>`.
 *
 * The job is idempotent: cutoffs are computed at call time, so running
 * twice in a row simply finds nothing to delete on the second pass.
 */
import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import { purgeOldTrash } from "../src/core-plugins/pages";

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });

  let days = 30;
  for (const arg of process.argv.slice(2)) {
    const m = /^--days=(\d+)$/.exec(arg);
    if (m) {
      days = Number(m[1]);
      continue;
    }
    console.error(`Unknown flag: ${arg}`);
    process.exit(64);
  }

  const start = Date.now();
  const rows = await purgeOldTrash(db, days);
  const elapsed = Date.now() - start;
  console.log(`pruned in ${elapsed}ms: pages_purged=${rows} (cutoff=${days} days)`);
}

main().catch((err) => {
  console.error("[pages-purge-trash] failed:", err);
  process.exit(1);
});
