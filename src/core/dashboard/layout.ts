/**
 * Dashboard layout persistence — stored as JSON under `users.meta.dashboard_layout`.
 *
 * Shape: `[{ slug, x, y, w, h }, ...]` — coordinates on a 12-col grid,
 * `h` in row units. RGL packs vertically when `compactType: 'vertical'`
 * is set, so the saved layout always describes the user's most recent
 * arrangement.
 */
import { z } from "zod";
import type { DbClient } from "@core/db/client";

const layoutItemSchema = z.object({
  slug: z.string().min(1),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(50),
});
const layoutSchema = z.array(layoutItemSchema);

export type DashboardLayoutItem = z.infer<typeof layoutItemSchema>;
export type DashboardLayout = DashboardLayoutItem[];

/** Read a user's saved dashboard layout. Returns null if unset or invalid. */
export async function getDashboardLayout(
  db: DbClient,
  userId: string
): Promise<DashboardLayout | null> {
  const r = await db.execute({
    sql: "SELECT meta FROM users WHERE id = ? LIMIT 1",
    args: [userId]
  });
  const raw = r.rows[0]?.meta;
  if (!raw) return null;

  try {
    const meta = JSON.parse(String(raw)) as Record<string, unknown>;
    const candidate = meta.dashboard_layout;
    if (!candidate) return null;
    return layoutSchema.parse(candidate);
  } catch {
    return null;
  }
}

/** Persist a user's dashboard layout. Merges into `users.meta`. */
export async function saveDashboardLayout(
  db: DbClient,
  userId: string,
  layout: DashboardLayout
): Promise<void> {
  const validated = layoutSchema.parse(layout);

  const r = await db.execute({
    sql: "SELECT meta FROM users WHERE id = ? LIMIT 1",
    args: [userId]
  });
  const existingRaw = r.rows[0]?.meta;
  let meta: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      meta = JSON.parse(String(existingRaw)) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  }
  meta.dashboard_layout = validated;

  await db.execute({
    sql: "UPDATE users SET meta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [JSON.stringify(meta), userId]
  });
}

/**
 * Build a default layout for users with no saved arrangement: walk the
 * widget list in registration order, packing each at its `defaultSize`
 * across a 12-col grid using a vertical-compact pack.
 */
export function packDefaultLayout(
  widgets: { slug: string; defaultSize: { w: number; h: number } }[]
): DashboardLayout {
  const out: DashboardLayout = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const widget of widgets) {
    const w = Math.max(1, Math.min(12, widget.defaultSize.w));
    const h = Math.max(1, widget.defaultSize.h);
    if (x + w > 12) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    out.push({ slug: widget.slug, x, y, w, h });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}
