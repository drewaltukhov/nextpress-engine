import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import { runRetentionCleanup, DEFAULT_RETENTION } from "../src/core-plugins/logging";

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });

  const policy = { ...DEFAULT_RETENTION };
  // CLI overrides: --system=30, --failed-logins=90, etc.
  for (const arg of process.argv.slice(2)) {
    const m = /^--([a-z-]+)=(\d+)$/.exec(arg);
    if (!m) continue;
    const days = Number(m[2]);
    switch (m[1]) {
      case "system": policy.systemLogDays = days; break;
      case "failed-jobs": policy.failedJobsDays = days; break;
      case "failed-logins": policy.failedLoginsDays = days; break;
      case "plugin-failures": policy.pluginFailuresDays = days; break;
      default:
        console.error(`Unknown flag: --${m[1]}`);
        process.exit(64);
    }
  }

  const start = Date.now();
  const r = await runRetentionCleanup(db, { policy });
  const elapsed = Date.now() - start;
  console.log(
    `pruned in ${elapsed}ms: system_log=${r.systemLog}, failed_jobs=${r.failedJobs}, ` +
      `failed_logins=${r.failedLogins}, plugin_failures=${r.pluginFailures}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
