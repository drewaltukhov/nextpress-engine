"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { validateAdminPath } from "@core/auth/admin-path-validator";

export type SaveResult = { ok: true; path: string } | { ok: false; error: string };

export interface HideAdminSettings {
  /** "" when hiding is off; non-empty slug otherwise. */
  path: string;
  /** True when NEXTPRESS_ADMIN_PATH is set — UI shows a read-only banner. */
  envOverrideActive: boolean;
  /** The value the env var forces (for the banner copy). */
  envOverrideValue: string | null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false as const, error: "Only administrators can change Hide Admin settings" };
  }
  return { ok: true as const, session };
}

/**
 * Returns null if the proposed slug doesn't collide with an existing
 * redirect or published page; returns an error string otherwise.
 *
 * - Redirects: `from_path` is stored with leading slash (e.g. "/old-page"),
 *   so compare with `input` directly.
 * - Pages: `slug` is stored without leading slash (e.g. "about-us"),
 *   so strip the leading "/" before comparing.
 */
async function detectCollision(input: string): Promise<string | null> {
  const c = db();
  const pageSlug = input.slice(1); // strip leading "/"

  // hide-admin is a single-tenant setting; queries match the tenantId=1 default.
  const [redirectRow, pageRow] = await Promise.all([
    c
      .execute({
        sql: "SELECT id FROM redirects WHERE tenant_id = 1 AND from_path = ? LIMIT 1",
        args: [input],
      })
      .catch(() => ({ rows: [] as unknown[] })),
    c
      .execute({
        sql: "SELECT id, title FROM pages WHERE tenant_id = 1 AND slug = ? AND trashed_at IS NULL LIMIT 1",
        args: [pageSlug],
      })
      .catch(() => ({ rows: [] as unknown[] })),
  ]);

  if (redirectRow.rows.length > 0) {
    const id = (redirectRow.rows[0] as { id: number | string }).id;
    return `"${input}" collides with redirect #${id}. Delete the redirect or pick another path.`;
  }
  if (pageRow.rows.length > 0) {
    const row = pageRow.rows[0] as { title: string };
    return `"${input}" collides with page "${row.title}". Pick another path.`;
  }
  return null;
}

export async function getHideAdminSettings(): Promise<HideAdminSettings> {
  const stored = await getSetting<string>(db(), "hide-admin.path");
  const env = process.env.NEXTPRESS_ADMIN_PATH;
  return {
    path: stored ?? "",
    envOverrideActive: typeof env === "string" && env.trim().length > 0,
    envOverrideValue: typeof env === "string" ? env.trim() : null,
  };
}

export async function saveAdminPath(rawInput: string): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  const input = String(rawInput ?? "").trim();
  if (input.length === 0) {
    return { ok: false, error: "Path must not be empty. Use Clear to disable hiding." };
  }
  const validation = validateAdminPath(input);
  if (!validation.ok) return { ok: false, error: validation.reason };

  // Collision detection — spec requirement. Cheap (two indexed lookups).
  const collision = await detectCollision(input);
  if (collision !== null) return { ok: false, error: collision };

  const actorId = await resolveUserId(db(), guard.session.user);
  try {
    await setSetting(db(), "hide-admin.path", input, { updatedBy: actorId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "hide-admin",
      diff: { path: input },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/hide-admin");
  return { ok: true, path: input };
}

export async function clearAdminPath(): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  const actorId = await resolveUserId(db(), guard.session.user);
  try {
    await setSetting(db(), "hide-admin.path", "", { updatedBy: actorId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "hide-admin",
      diff: { path: "" },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/hide-admin");
  return { ok: true, path: "" };
}
