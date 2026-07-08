/**
 * Demo snapshot generator.
 *
 * Reads from the local dev DB (`.env.local`) and writes:
 *   - scripts/seed-assets/demo/demo.npbackup       (the bundle)
 *   - scripts/seed-assets/demo/manifest-summary.txt (human-readable diff aid)
 *
 * Run:
 *   npx tsx --env-file-if-exists=.env.local scripts/snapshot-demo.ts
 *
 * Idempotent in content: two consecutive runs against the same DB produce
 * logically equivalent bundles (same rows, same tables). The bundle bytes
 * are NOT identical across runs — `fflate.zipSync` embeds per-entry mtimes
 * and the manifest carries a fresh `createdAt`. Diff the `manifest-summary.txt`
 * for a meaningful change-review.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import { ENGINE_VERSION } from "../src/core/version";
import { buildDemoBundle } from "../src/core/backup/snapshot";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "seed-assets", "demo");
const BUNDLE_PATH = join(OUT_DIR, "demo.npbackup");
const SUMMARY_PATH = join(OUT_DIR, "manifest-summary.txt");
const SIZE_WARN_BYTES = 25 * 1024 * 1024;

async function main() {
  const env = readEnv();
  const db = createDbClient({
    databaseUrl: env.databaseUrl,
    authToken: env.authToken,
  });

  console.log(`[snapshot-demo] reading ${env.provider} DB at ${env.databaseUrl}`);

  const { bytes, manifest } = await buildDemoBundle(db, {
    version: ENGINE_VERSION,
    provider: env.provider,
  });

  writeFileSync(BUNDLE_PATH, bytes);

  const sortedTables = Object.entries(manifest.tables).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const summary = [
    `NextPress demo snapshot summary`,
    `===============================`,
    ``,
    `engine:        ${manifest.engine}`,
    `version:       ${manifest.version}`,
    `provider:      ${manifest.provider}`,
    `createdAt:     ${manifest.createdAt}`,
    `includesMedia: ${manifest.includesMedia}`,
    `includesLogs:  ${manifest.includesLogs}`,
    `totalRows:     ${manifest.totalRows}`,
    `bundleBytes:   ${bytes.byteLength}`,
    ``,
    `Tables (${sortedTables.length}):`,
    ...sortedTables.map(([t, n]) => `  ${t.padEnd(40, " ")} ${String(n).padStart(6, " ")} row(s)`),
    ``,
  ].join("\n");

  writeFileSync(SUMMARY_PATH, summary, "utf8");

  console.log(`[snapshot-demo] wrote ${BUNDLE_PATH} (${bytes.byteLength} bytes)`);
  console.log(`[snapshot-demo] wrote ${SUMMARY_PATH}`);
  if (bytes.byteLength > SIZE_WARN_BYTES)
    console.warn(`[snapshot-demo] WARNING: bundle is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB (>${SIZE_WARN_BYTES / 1024 / 1024}MB threshold). Consider whether the demo content has grown unnecessarily.`);

}

main().catch((err) => {
  console.error("[snapshot-demo] FAILED:", err);
  process.exit(1);
});
