import type { DbClient } from "@core/db/client";

export interface RevisionRow {
  id: number;
  snapshot: string; // raw JSON string
  createdBy: string | null;
  createdAt: string;
}

export async function getRevision(
  db: DbClient,
  id: number,
): Promise<RevisionRow | null> {
  const r = await db.execute({
    sql: `SELECT id, snapshot, created_by, created_at
          FROM content_revisions WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    snapshot: String(row.snapshot),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

export async function saveRevision(
  db: DbClient,
  kind: "post" | "page",
  contentId: number,
  snapshot: unknown,
  createdBy?: string | null,
  keep = 5,
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO content_revisions (kind, content_id, snapshot, created_by)
          VALUES (?, ?, ?, ?)`,
    args: [kind, contentId, JSON.stringify(snapshot), createdBy ?? null],
  });

  // Prune: keep only the `keep` most recent revisions for this content item.
  await db.execute({
    sql: `DELETE FROM content_revisions
          WHERE kind = ? AND content_id = ?
            AND id NOT IN (
              SELECT id FROM content_revisions
              WHERE kind = ? AND content_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            )`,
    args: [kind, contentId, kind, contentId, keep],
  });
}

export async function getRevisions(
  db: DbClient,
  kind: "post" | "page",
  contentId: number,
  limit = 3,
): Promise<RevisionRow[]> {
  const r = await db.execute({
    sql: `SELECT id, snapshot, created_by, created_at
          FROM content_revisions
          WHERE kind = ? AND content_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
    args: [kind, contentId, limit],
  });

  return r.rows.map((row) => ({
    id: Number(row.id),
    snapshot: String(row.snapshot),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  }));
}
