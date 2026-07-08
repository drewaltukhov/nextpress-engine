/**
 * Builds a demo-content `.npbackup` bundle from a live DB.
 *
 * Extracted from `scripts/snapshot-demo.ts` so the byte stream is unit-
 * testable (vitest can call this without spawning a node process or
 * touching the filesystem).
 *
 * The bundle is a ZIP with the regular `.npbackup` shape — `manifest.json`
 * plus one `data/<table>.json` per included table — and differs from a
 * normal admin backup only in that it (a) includes the `media` table with
 * blobs base64-encoded, (b) omits auth + log tables via DEMO_EXCLUDES, and
 * (c) redacts encrypted `site_settings` rows via isDemoRedactedRow.
 */
import { zipSync, strToU8 } from "fflate";
import type { DbClient } from "@core/db/client";
import { exportDatabase } from "./exporter";
import { DEMO_EXCLUDES, isDemoRedactedRow } from "./demo-policy";
import type { BackupManifest, BackupProvider } from "./manifest";

export interface BuildDemoBundleOptions {
  version: string;
  provider: BackupProvider;
}

export interface BuildDemoBundleResult {
  bytes: Uint8Array;
  manifest: BackupManifest;
}

export async function buildDemoBundle(
  db: DbClient,
  opts: BuildDemoBundleOptions
): Promise<BuildDemoBundleResult> {
  const { data, manifest } = await exportDatabase(db, {
    includeLogs: false,
    version: opts.version,
    provider: opts.provider,
    includeMedia: true,
    extraExcludes: DEMO_EXCLUDES,
    includeRow: (table, row) => !isDemoRedactedRow(table, row),
  });

  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const [table, rows] of Object.entries(data)) {
    files[`data/${table}.json`] = strToU8(JSON.stringify(rows));
  }

  const bytes = zipSync(files, { level: 6 });
  return { bytes, manifest };
}
