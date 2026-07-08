import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import { zipSync, strToU8 } from "fflate";

const SAFE_FILENAME = /[^A-Za-z0-9._-]/g;

interface MediaRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  blob_data: unknown;
  storage_backend: string;
  uploaded_at: string;
}

interface ManifestEntry {
  id: string;
  filename: string;
  archivePath: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
}

function toUint8(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data as number[]);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  return null;
}

function safeName(filename: string): string {
  const clean = filename.trim().replace(SAFE_FILENAME, "_").slice(0, 200);
  return clean.length > 0 ? clean : "file";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!session.user.roles?.includes("admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const res = await db().execute({
    sql: `SELECT id, filename, mime, size_bytes, blob_data, storage_backend, uploaded_at
          FROM media
          WHERE tenant_id = 1
          ORDER BY uploaded_at ASC`,
    args: [],
  });

  const files: Record<string, Uint8Array> = {};
  const entries: ManifestEntry[] = [];
  let skippedNonDb = 0;
  let skippedEmpty = 0;

  for (const raw of res.rows) {
    const row = raw as unknown as MediaRow;
    if (row.storage_backend !== "db") {
      // Plugin-storage backends host their bytes off-DB; out of scope here.
      // Future work: dispatch via api.media.registerStorage().get() once that
      // surface ships.
      skippedNonDb++;
      continue;
    }
    const bytes = toUint8(row.blob_data);
    if (!bytes || bytes.byteLength === 0) {
      skippedEmpty++;
      continue;
    }
    const archivePath = `media/${row.id}-${safeName(row.filename)}`;
    files[archivePath] = bytes;
    entries.push({
      id: row.id,
      filename: row.filename,
      archivePath,
      mime: row.mime,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at,
    });
  }

  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        kind: "nextpress-media-backup",
        version: 1,
        generatedAt: new Date().toISOString(),
        count: entries.length,
        skippedNonDb,
        skippedEmpty,
        entries,
      },
      null,
      2,
    ),
  );

  const zipBytes = zipSync(files, { level: 6 });

  const filename = `nextpress-media-${new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[T:]/g, "-")}.zip`;

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

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "media-backup.created",
      targetType: "backup",
      targetId: filename,
      diff: {
        fileName: filename,
        sizeBytes: zipBytes.length,
        count: entries.length,
        skippedNonDb,
        skippedEmpty,
      },
    });
  } catch {
    // Audit failures must not block the download.
  }

  return new Response(Buffer.from(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBytes.length),
    },
  });
}
