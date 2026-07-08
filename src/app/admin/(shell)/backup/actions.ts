"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { restoreDatabase } from "@core/backup/importer";
import {
  validateManifest,
  checkVersionCompat,
  checkProviderCompat,
  getManifestProvider,
  type BackupManifest,
} from "@core/backup/manifest";
import { validateStepUp } from "@core-plugins/security/step-up";
import { ENGINE_VERSION } from "@core/version";
import { readEnv } from "@core/env";
import { unzipSync, strFromU8 } from "fflate";

export type SaveResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Restore preview — parse the uploaded file and return a summary
// ---------------------------------------------------------------------------

export interface RestorePreview {
  manifest: BackupManifest;
  versionOk: boolean;
  versionMessage?: string;
  /** Cross-dialect restore isn't supported yet — flagged here so the UI can
   *  show the message and disable the confirm button before the user types
   *  their password. */
  providerOk: boolean;
  providerMessage?: string;
}

export async function previewRestore(formData: FormData): Promise<
  { ok: true; preview: RestorePreview } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can restore backups" };
  }

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "No file uploaded" };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unzipped = unzipSync(bytes);

    const manifestBytes = unzipped["manifest.json"];
    if (!manifestBytes) {
      return { ok: false, error: "Invalid backup file: missing manifest.json" };
    }

    const manifest = JSON.parse(strFromU8(manifestBytes));
    if (!validateManifest(manifest)) {
      return { ok: false, error: "Invalid backup file: malformed manifest" };
    }

    const compat = checkVersionCompat(manifest.version, ENGINE_VERSION);
    const providerCompat = checkProviderCompat(
      getManifestProvider(manifest),
      readEnv().provider
    );

    return {
      ok: true,
      preview: {
        manifest,
        versionOk: compat.ok,
        versionMessage: compat.message,
        providerOk: providerCompat.ok,
        providerMessage: providerCompat.message,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to read backup file",
    };
  }
}

// ---------------------------------------------------------------------------
// Restore confirm — verify password, auto-backup, then restore
// ---------------------------------------------------------------------------

export async function confirmRestore(formData: FormData): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can restore backups" };
  }

  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const file = formData.get("file") as File | null;
  const password = formData.get("password") as string | null;
  if (!file) return { ok: false, error: "No file uploaded" };
  if (!password) return { ok: false, error: "Password is required" };

  // Resolve the actual DB user ID — the JWT's session.user.id can be stale
  // if the user was re-created (e.g. setup wizard on a fresh DB).
  let dbUserId = session.user.id;
  const credCheck = await db().execute({
    sql: "SELECT user_id FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [dbUserId],
  });
  if (credCheck.rows.length === 0) {
    // ID mismatch — try email lookup
    const userRow = await db().execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [session.user.email],
    });
    if (userRow.rows.length > 0) {
      dbUserId = String(userRow.rows[0].id);
    } else {
      // Last resort — just grab the first admin
      const adminRow = await db().execute({
        sql: `SELECT u.id FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              WHERE ur.role_slug = 'admin' LIMIT 1`,
        args: [],
      });
      if (adminRow.rows.length > 0) {
        dbUserId = String(adminRow.rows[0].id);
      } else {
        return { ok: false, error: "Could not find an admin account to verify against" };
      }
    }
  }

  const stepUpResult = await validateStepUp(db(), dbUserId, password.trim());
  if (!stepUpResult) return { ok: false, error: "Incorrect password" };

  // Parse the backup file
  let unzipped: Record<string, Uint8Array>;
  let manifest: BackupManifest;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    unzipped = unzipSync(bytes);

    const manifestBytes = unzipped["manifest.json"];
    if (!manifestBytes) return { ok: false, error: "Invalid backup file" };

    manifest = JSON.parse(strFromU8(manifestBytes));
    if (!validateManifest(manifest)) return { ok: false, error: "Invalid manifest" };

    const compat = checkVersionCompat(manifest.version, ENGINE_VERSION);
    if (!compat.ok) return { ok: false, error: compat.message! };

    const providerCompat = checkProviderCompat(
      getManifestProvider(manifest),
      readEnv().provider
    );
    if (!providerCompat.ok) return { ok: false, error: providerCompat.message! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to read backup" };
  }

  // Parse table data from the ZIP
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (!path.startsWith("data/") || !path.endsWith(".json")) continue;
    const table = path.slice("data/".length, -".json".length);
    try {
      data[table] = JSON.parse(strFromU8(bytes));
    } catch {
      // Skip unparseable tables
    }
  }

  // Restore
  try {
    await restoreDatabase(db(), data, readEnv().provider);
  } catch (err) {
    return {
      ok: false,
      error: `Restore failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  // Write audit entry directly via SQL — the auditLog() helper may have stale
  // state after the restore replaced tables. Resolve the user ID from the
  // restored data so the FK is valid.
  try {
    const restoredUser = await db().execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [session.user.email],
    });
    const actorId = restoredUser.rows[0]?.id ? String(restoredUser.rows[0].id) : dbUserId;

    await db().execute({
      sql: `INSERT INTO audit_log (tenant_id, actor_user_id, action, target_type, target_id, diff, created_at)
            VALUES (1, ?, 'backup.restored', 'backup', ?, ?, datetime('now'))`,
      args: [
        actorId,
        manifest.createdAt,
        JSON.stringify({
          fileName: file.name,
          tables: Object.keys(data).length,
          rows: manifest.totalRows,
        }),
      ],
    });
  } catch {
    // Audit failures must not block
  }

  revalidatePath("/admin");
  return { ok: true };
}
