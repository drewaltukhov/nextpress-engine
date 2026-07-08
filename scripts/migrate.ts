import { resolve } from "node:path";
import { createDbClient, ensureSync } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import {
  applyMigrations,
  planMigrations,
  migrationStatus,
  rollbackMigration,
  type PluginMigrationSource
} from "../src/core/migrate/runner";
import { topoSort } from "../src/core/plugins/loader";
import { discoveredPlugins } from "../src/generated/plugins";

const KERNEL_DIR = resolve(process.cwd(), "src/core/db/migrations/core");

function buildSources(): PluginMigrationSource[] {
  return [
    { slug: "core", migrationsDir: KERNEL_DIR },
    ...topoSort(discoveredPlugins)
      .filter((p) => p.migrationsDir)
      .map((p) => ({
        slug: p.manifest.slug,
        migrationsDir: resolve(process.cwd(), p.migrationsDir as string)
      }))
  ];
}

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  await ensureSync();
  const sources = buildSources();
  const sub = process.argv[2];

  switch (sub) {
    case "apply": {
      // Allow build/CI contexts to override the 5-minute stale-lock window.
      // Vercel deploys can land within 5 minutes of each other, and the
      // previous deploy's instrumentation.ts boot may have left a lock if
      // its container was killed before release. The build is sequential
      // by Vercel's design — safe to steal a freshly-orphaned lock.
      const staleEnv = process.env.MIGRATE_STALE_MS;
      const staleMs = staleEnv !== undefined ? Number(staleEnv) : undefined;
      if (staleEnv !== undefined && !Number.isFinite(staleMs)) {
        console.error(`MIGRATE_STALE_MS must be a number, got: ${staleEnv}`);
        process.exit(64);
      }

      const result = await applyMigrations({
        db,
        plugins: sources,
        owner: `cli:${process.pid}`,
        appliedBy: process.env.USER ?? null,
        staleMs,
      });
      if (result.lockHeld) {
        console.error(`migration lock held by ${result.heldBy}`);
        process.exit(1);
      }
      console.log(`Applied: ${result.applied.length}`);
      for (const a of result.applied) console.log(`  + ${a.pluginSlug}/${a.fileName}`);
      console.log(`Skipped (already applied): ${result.skipped.length}`);
      console.log(`Failed: ${result.failures.length}`);
      for (const f of result.failures) console.error(`  ! ${f.pluginSlug}/${f.fileName}: ${f.error}`);
      process.exit(result.failures.length > 0 ? 2 : 0);
    }
    case "plan": {
      const plan = await planMigrations({ db, plugins: sources });
      console.log(`Pending: ${plan.pending.length}`);
      for (const m of plan.pending) console.log(`  - ${m.pluginSlug}/${m.fileName}`);
      process.exit(0);
    }
    case "status": {
      const status = await migrationStatus({ db, plugins: sources });
      for (const [slug, info] of Object.entries(status.byPlugin)) {
        console.log(`[${slug}] applied=${info.applied.length} pending=${info.pending.length}`);
        for (const a of info.applied) console.log(`  ✓ ${a.fileName}`);
        for (const p of info.pending) console.log(`  ○ ${p.fileName}`);
      }
      process.exit(0);
    }
    case "rollback": {
      const slug = process.argv[3];
      const file = process.argv[4];
      if (!slug || !file) {
        console.error("Usage: npm run migrate:rollback <plugin-slug> <file-name>");
        process.exit(64);
      }
      const r = await rollbackMigration({ db, pluginSlug: slug, fileName: file });
      console.log(r.removed ? `Removed log entry for ${slug}/${file}` : `No log entry found for ${slug}/${file}`);
      process.exit(0);
    }
    default:
      console.error("Usage: tsx scripts/migrate.ts [apply|plan|status|rollback]");
      process.exit(64);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
