/**
 * Backup manifest — describes the contents of a .npbackup archive.
 */

export type BackupProvider = "turso" | "supabase";

export interface BackupManifest {
  engine: "nextpress";
  version: string;
  createdAt: string;
  tables: Record<string, number>; // table name → row count
  totalRows: number;
  includesLogs: boolean;
  checksum: string; // SHA-256 of the concatenated table JSON
  /** DB dialect that produced this archive. Missing on backups created before
   *  multi-DB support shipped — those are read as "turso" (libSQL). */
  provider?: BackupProvider;
  /** Set by exporters that opt media in (e.g. the demo snapshot generator).
   *  Missing on regular admin backups, treated as `false`. */
  includesMedia?: boolean;
}

export interface VersionCompat {
  ok: boolean;
  message?: string;
}

export interface ProviderCompat {
  ok: boolean;
  message?: string;
}

/** Legacy backups (no `provider` field) are libSQL-era — treat as Turso. */
export function getManifestProvider(m: BackupManifest): BackupProvider {
  return m.provider ?? "turso";
}

/**
 * Phase 1 restore is same-dialect only. Cross-dialect restore would need a
 * transcoded importer (issue #56, option 2). When the backup's source provider
 * doesn't match the running provider, refuse with a message that tells the user
 * exactly how to make the restore work.
 */
export function checkProviderCompat(
  backupProvider: BackupProvider,
  currentProvider: BackupProvider
): ProviderCompat {
  if (backupProvider === currentProvider) return { ok: true };
  const labels: Record<BackupProvider, string> = {
    turso: "libSQL (Turso / local file)",
    supabase: "Postgres (Supabase)",
  };
  return {
    ok: false,
    message:
      `This backup was created from a ${labels[backupProvider]} database. ` +
      `Your site is currently running on ${labels[currentProvider]}. ` +
      `Cross-engine restore isn't supported yet — switch NEXTPRESS_DB_PROVIDER ` +
      `to match the backup's engine before restoring.`,
  };
}

/**
 * Check whether a backup is compatible with the running NextPress version.
 *
 * - Same major version → proceed normally
 * - Different major → blocked
 * - Backup from newer minor → warning but allowed
 */
export function checkVersionCompat(
  backupVersion: string,
  currentVersion: string
): VersionCompat {
  const bParts = backupVersion.split(/[.-]/).map(Number);
  const cParts = currentVersion.split(/[.-]/).map(Number);

  const [bMajor = 0, bMinor = 0] = bParts;
  const [cMajor = 0, cMinor = 0] = cParts;

  if (bMajor !== cMajor) {
    return {
      ok: false,
      message: `This backup was created with NextPress v${backupVersion}. Please install NextPress v${bMajor}.x before restoring.`,
    };
  }

  if (bMinor > cMinor) {
    return {
      ok: true,
      message: `This backup was created with a newer version (v${backupVersion}). Some data may not display correctly until you update.`,
    };
  }

  return { ok: true };
}

export function validateManifest(data: unknown): data is BackupManifest {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  return (
    m.engine === "nextpress" &&
    typeof m.version === "string" &&
    typeof m.createdAt === "string" &&
    typeof m.tables === "object" &&
    typeof m.totalRows === "number" &&
    typeof m.checksum === "string"
  );
}
