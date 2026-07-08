import type { DbClient } from "@core/db/client";
import { normalizeSlug } from "./normalize";

export interface ReserveInput {
  slug: string;
  reason: string;
  source: string;
  tenantId?: number;
  addedBy?: string;
}

export interface ReleaseInput {
  slug: string;
  source: string;
  tenantId?: number;
}

export interface ReservationRow {
  slug: string;
  tenantId: number;
  source: string;
  reason: string;
  addedBy: string | null;
  createdAt: string;
}

export async function reserveSlug(db: DbClient, input: ReserveInput): Promise<void> {
  const slug = normalizeSlug(input.slug);
  const tenantId = input.tenantId ?? 1;
  await db.execute({
    sql: `INSERT INTO reserved_slugs (slug, tenant_id, source, reason, added_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, slug) DO UPDATE
            SET source = excluded.source,
                reason = excluded.reason,
                added_by = excluded.added_by`,
    args: [slug, tenantId, input.source, input.reason, input.addedBy ?? null]
  });
}

export async function releaseSlug(db: DbClient, input: ReleaseInput): Promise<{ removed: boolean }> {
  const slug = normalizeSlug(input.slug);
  const tenantId = input.tenantId ?? 1;
  const r = await db.execute({
    sql: "DELETE FROM reserved_slugs WHERE tenant_id = ? AND slug = ? AND source = ?",
    args: [tenantId, slug, input.source]
  });
  return { removed: r.rowsAffected > 0 };
}

export async function isSlugReserved(db: DbClient, slug: string, tenantId = 1): Promise<boolean> {
  const norm = normalizeSlug(slug);
  const r = await db.execute({
    sql: "SELECT 1 FROM reserved_slugs WHERE tenant_id = ? AND slug = ? LIMIT 1",
    args: [tenantId, norm]
  });
  return r.rows.length > 0;
}

export async function listReservations(db: DbClient, tenantId = 1): Promise<ReservationRow[]> {
  const r = await db.execute({
    sql: `SELECT slug, tenant_id, source, reason, added_by, created_at
          FROM reserved_slugs
          WHERE tenant_id = ?
          ORDER BY slug ASC`,
    args: [tenantId]
  });
  return r.rows.map((row) => ({
    slug: String(row.slug),
    tenantId: Number(row.tenant_id),
    source: String(row.source),
    reason: String(row.reason),
    addedBy: row.added_by != null ? String(row.added_by) : null,
    createdAt: String(row.created_at)
  }));
}
