import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { exportDatabase } from "@core/backup";
import { auditLog } from "@core-plugins/logging";
import { ENGINE_VERSION } from "@core/version";
import { readEnv } from "@core/env";
import { zipSync, strToU8 } from "fflate";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!session.user.roles?.includes("admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const includeLogs = url.searchParams.get("includeLogs") === "1";

  // Export all tables
  const { data, manifest } = await exportDatabase(db(), {
    includeLogs,
    version: ENGINE_VERSION,
    provider: readEnv().provider,
  });

  // Build ZIP archive
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  };

  for (const [table, rows] of Object.entries(data)) {
    files[`data/${table}.json`] = strToU8(JSON.stringify(rows));
  }

  const zipBytes = zipSync(files, { level: 6 });

  // Resolve actual DB user ID (JWT sub can be stale after setup wizard re-creation)
  let actorId = session.user.id;
  try {
    const userRow = await db().execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [session.user.email],
    });
    if (userRow.rows[0]?.id) actorId = String(userRow.rows[0].id);
  } catch {
    // Fall back to session ID
  }

  const now = new Date();
  const filename = `nextpress-backup-${now.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.npbackup`;

  // Audit log
  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "backup.created",
      targetType: "backup",
      targetId: filename,
      diff: {
        fileName: filename,
        sizeBytes: zipBytes.length,
        tableCount: Object.keys(manifest.tables).length,
        totalRows: manifest.totalRows,
        includeLogs,
      },
    });
  } catch {
    // Audit failures must not block the download
  }

  return new Response(Buffer.from(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBytes.length),
    },
  });
}
