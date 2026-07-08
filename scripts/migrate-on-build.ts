/**
 * Run pending migrations as part of the Vercel production build.
 *
 * Vercel sets VERCEL_ENV to "production" | "preview" | "development" during
 * its build step. We only want to apply migrations on production builds:
 *   - Local `npm run build` → VERCEL_ENV unset → skip (use `npm run migrate`)
 *   - Preview deploys (PRs, branches) → VERCEL_ENV=preview → skip
 *     (avoids preview builds writing schema to the prod DB; if you want
 *     preview-DB migrations later, set up a separate preview Turso DB and
 *     extend this script to run when VERCEL_ENV=preview AND a preview-only
 *     URL is set)
 *   - Production deploys (main → live) → VERCEL_ENV=production → apply.
 *
 * Wired in as part of the `prebuild` script so a failed migration aborts
 * the build before Next.js compiles. Better to fail loud than ship a
 * broken schema.
 */
import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv !== "production") {
  console.log(
    `[migrate-on-build] Skipping migrations — VERCEL_ENV=${
      vercelEnv ?? "(unset; local build)"
    }`
  );
  process.exit(0);
}

if (!process.env.TURSO_DATABASE_URL?.trim()) {
  console.error(
    "[migrate-on-build] VERCEL_ENV=production but TURSO_DATABASE_URL is not set. " +
      "Add it to the Vercel project's Production environment variables and redeploy."
  );
  process.exit(1);
}

console.log(
  "[migrate-on-build] Production deploy — applying migrations against Turso..."
);

// Steal any lingering migration lock — Vercel keeps prior containers warm
// long enough that their instrumentation.ts boot can leave a lock behind
// (within the 5-min stale window) when the container is killed before
// release. Build context is sequential by Vercel's design, so stealing a
// previous lock is always the right move.
execSync("npm run migrate", {
  stdio: "inherit",
  env: { ...process.env, MIGRATE_STALE_MS: "0" },
});
console.log("[migrate-on-build] Migrations applied.");
