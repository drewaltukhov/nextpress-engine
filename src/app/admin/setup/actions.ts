"use server";

import { db } from "@core/db/instance";
import { hashPassword } from "@core-plugins/users/passwords";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { restoreDatabase } from "@core/backup/importer";
import {
  validateManifest,
  checkVersionCompat,
  checkProviderCompat,
  getManifestProvider,
  type BackupManifest,
  type BackupProvider,
} from "@core/backup/manifest";
import { ENGINE_VERSION } from "@core/version";
import { readEnv } from "@core/env";
import type { DbClient } from "@core/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupData {
  // Step 1 — Site
  siteTitle: string;
  siteTagline: string;
  siteUrl: string;
  siteTimezone: string;
  // Step 2 — Admin
  adminEmail: string;
  adminDisplayName: string;
  adminPassword: string;
  // Step 3 — Review
  installDemoContent: boolean;
}

export type SetupResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Demo bundle restore helper
// ---------------------------------------------------------------------------

const DEMO_BUNDLE_PATH = join(
  process.cwd(),
  "scripts",
  "seed-assets",
  "demo",
  "demo.npbackup"
);

/**
 * Restores a demo `.npbackup` bundle into `db`. Exported for unit testing —
 * `completeSetup` calls this when `installDemoContent === true`.
 *
 * Throws a human-readable Error on malformed bundles, version mismatch, or
 * provider mismatch — `completeSetup` catches and surfaces them.
 */
export async function applyDemoBundle(
  db: DbClient,
  bytes: Uint8Array,
  provider: BackupProvider
): Promise<void> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("Invalid demo backup file (failed to unzip)");
  }

  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) {
    throw new Error("Invalid demo backup file: missing manifest.json");
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
  } catch {
    throw new Error("Invalid demo backup file: manifest.json is not valid JSON");
  }
  if (!validateManifest(manifest)) {
    throw new Error("Invalid demo backup file: malformed manifest");
  }

  const versionCompat = checkVersionCompat(manifest.version, ENGINE_VERSION);
  if (!versionCompat.ok) throw new Error(versionCompat.message!);

  const providerCompat = checkProviderCompat(getManifestProvider(manifest), provider);
  if (!providerCompat.ok) throw new Error(providerCompat.message!);

  const data: Record<string, Record<string, unknown>[]> = {};
  for (const [path, raw] of Object.entries(entries)) {
    if (!path.startsWith("data/") || !path.endsWith(".json")) continue;
    const table = path.slice("data/".length, -".json".length);
    try {
      data[table] = JSON.parse(strFromU8(raw));
    } catch (err) {
      // Don't fail the whole restore over one bad table — emit a warning
      // so a partial restore is at least visible in the logs.
      console.warn(
        `[applyDemoBundle] skipped unparseable table "${table}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  await restoreDatabase(db, data, provider, { includeMedia: true });
}

// ---------------------------------------------------------------------------
// completeSetup
// ---------------------------------------------------------------------------

export async function completeSetup(data: SetupData): Promise<SetupResult> {
  // Guard: refuse if setup already done
  const done = await getSetting<boolean>(db(), "system.setup_complete");
  if (done === true) {
    return { ok: false, error: "Setup has already been completed" };
  }

  const email = data.adminEmail.trim().toLowerCase();
  const displayName = data.adminDisplayName.trim();

  if (!email || !displayName || !data.adminPassword) {
    return { ok: false, error: "Email, display name, and password are required" };
  }
  if (!data.siteTitle.trim()) {
    return { ok: false, error: "Site title is required" };
  }

  const secret = process.env.AUTH_SECRET;

  try {
    // ── (1) Restore demo content, if requested ───────────────────────
    if (data.installDemoContent) {
      let bundleBytes: Uint8Array;
      try {
        const buf = await readFile(DEMO_BUNDLE_PATH);
        bundleBytes = new Uint8Array(buf);
      } catch {
        return {
          ok: false,
          error:
            "Demo content bundle not found. Uncheck 'Install demo content' to complete setup.",
        };
      }
      try {
        await applyDemoBundle(db(), bundleBytes, readEnv().provider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { ok: false, error: `Demo restore failed: ${msg}` };
      }
    }

    // ── (2) Create or take over admin user ───────────────────────────
    // If the demo restore brought in a user with this email (e.g. the
    // maintainer's seed account whose email matches what the new admin
    // just typed), take over that user instead of inserting a duplicate.
    // Reusing the existing id preserves authorship of demo posts/pages
    // via the `created_by`/`uploaded_by` FKs. Status is forced to
    // 'active' so a previously-deactivated demo user can still log in.
    const now = new Date().toISOString();
    const existing = await db().execute({
      sql: "SELECT id FROM users WHERE tenant_id = 1 AND email = ? LIMIT 1",
      args: [email],
    });

    let userId: string;
    if (existing.rows.length > 0) {
      userId = String(existing.rows[0]!.id);
      await db().execute({
        sql: "UPDATE users SET display_name = ?, status = 'active', updated_at = ? WHERE id = ?",
        args: [displayName, now, userId],
      });
    } else {
      userId = randomUUID();
      await db().execute({
        sql: `INSERT INTO users (id, tenant_id, email, display_name, status, created_at, updated_at)
              VALUES (?, 1, ?, ?, 'active', ?, ?)`,
        args: [userId, email, displayName, now, now],
      });
    }

    const passwordHash = await hashPassword(data.adminPassword);
    await db().execute({
      sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)",
      args: [userId, passwordHash],
    });

    await db().execute({
      sql: "INSERT INTO user_roles (user_id, role_slug, tenant_id) VALUES (?, 'admin', 1)",
      args: [userId],
    });

    // ── (3) Apply user-supplied site settings (overrides demo's) ─────
    const opts = { updatedBy: userId, secret };

    await setSetting(db(), "site.title", data.siteTitle.trim(), opts);
    await setSetting(db(), "site.tagline", data.siteTagline.trim(), opts);
    await setSetting(db(), "site.url", data.siteUrl.trim(), opts);
    await setSetting(db(), "site.timezone", data.siteTimezone, opts);

    // ── (4) Seed reserved menus if missing ───────────────────────────
    for (const seed of [
      { slug: "primary", name: "Primary", location: "primary" },
      { slug: "footer", name: "Footer", location: "footer" },
    ]) {
      await db().execute({
        sql: `INSERT INTO menus (tenant_id, slug, name, location, style)
              SELECT 1, ?, ?, ?, 'dropdowns'
               WHERE NOT EXISTS (
                 SELECT 1 FROM menus WHERE tenant_id = 1 AND location = ?
               )`,
        args: [seed.slug, seed.name, seed.location, seed.location],
      });
    }

    // ── (5) Mark setup complete ──────────────────────────────────────
    await setSetting(db(), "system.setup_complete", true, opts);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Setup failed: ${message}` };
  }
}

