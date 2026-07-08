"use server";

import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { auth } from "@core/auth";
import { resolveUserId } from "@core/auth/resolve-user";
import {
  isKnownPermission,
  isSystemRole,
  permissionFor,
  roleSortKey,
  slugifyRoleLabel,
} from "./entities";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface RoleRow {
  slug: string;
  label: string;
  permissions: string[];
  system: boolean;
  userCount: number;
}

export async function getRolesWithUsage(): Promise<RoleRow[]> {
  const result = await db().execute({
    sql: `SELECT r.slug, r.label, r.permissions,
                 (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_slug = r.slug AND ur.tenant_id = 1) AS user_count
          FROM roles r`,
    args: []
  });

  const rows: RoleRow[] = result.rows.map((r) => {
    const slug = String(r.slug);
    const rawPerms = r.permissions;
    let perms: string[] = [];
    if (Array.isArray(rawPerms)) perms = rawPerms.map(String);
    else if (typeof rawPerms === "string") {
      try {
        const parsed = JSON.parse(rawPerms);
        if (Array.isArray(parsed)) perms = parsed.map(String);
      } catch {
        perms = [];
      }
    }
    return {
      slug,
      label: String(r.label),
      permissions: perms,
      system: isSystemRole(slug),
      userCount: Number(r.user_count ?? 0),
    };
  });

  return rows.sort((a, b) => roleSortKey(a.slug).localeCompare(roleSortKey(b.slug)));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateRoleInput {
  label: string;
  enabledPermissions: string[]; // permission strings like "posts.new"
}

export async function createRole(
  input: CreateRoleInput
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Role name is required" };

  const slug = slugifyRoleLabel(label);
  if (!slug) return { ok: false, error: "Role name must contain at least one letter or number" };

  if (isSystemRole(slug)) {
    return { ok: false, error: "That name is reserved by a system role" };
  }

  const existing = await db().execute({
    sql: "SELECT 1 FROM roles WHERE slug = ? LIMIT 1",
    args: [slug]
  });
  if (existing.rows.length > 0) {
    return { ok: false, error: "A role with this name already exists" };
  }

  const permissions = Array.from(new Set(input.enabledPermissions.filter(isKnownPermission)));

  await db().execute({
    sql: `INSERT INTO roles (slug, label, permissions, require_step_up)
          VALUES (?, ?, ?, '[]')`,
    args: [slug, label, JSON.stringify(permissions)]
  });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "roles.create",
      targetType: "role",
      targetId: slug,
      diff: { label, permissions }
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true, slug };
}

export async function deleteRole(
  slug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can delete roles" };
  }
  const actorId = await resolveUserId(db(), session.user);

  if (isSystemRole(slug)) {
    return { ok: false, error: "System roles can't be deleted" };
  }

  const exists = await db().execute({
    sql: "SELECT label FROM roles WHERE slug = ? LIMIT 1",
    args: [slug]
  });
  if (exists.rows.length === 0) return { ok: false, error: "Role not found" };
  const label = String(exists.rows[0].label);

  // Refuse if anyone still wears this role — deleting it would orphan them.
  const usage = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM user_roles WHERE role_slug = ? AND tenant_id = 1",
    args: [slug]
  });
  const userCount = Number(usage.rows[0]?.n ?? 0);
  if (userCount > 0) {
    return {
      ok: false,
      error: `Reassign the ${userCount} user${userCount === 1 ? "" : "s"} on this role first`
    };
  }

  await db().execute({ sql: "DELETE FROM roles WHERE slug = ?", args: [slug] });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "roles.delete",
      targetType: "role",
      targetId: slug,
      diff: { label }
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}

export async function setRolePermission(
  slug: string,
  entityId: string,
  gradeId: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  // Only the admin role's permissions are inviolate — every other role
  // (including remaining system roles) can be tuned. The slug stays reserved.
  if (slug === "admin") {
    return { ok: false, error: "Admin permissions can't be modified" };
  }

  const perm = permissionFor(entityId, gradeId);
  if (!isKnownPermission(perm)) {
    return { ok: false, error: "Unknown permission" };
  }

  const row = await db().execute({
    sql: "SELECT permissions FROM roles WHERE slug = ? LIMIT 1",
    args: [slug]
  });
  if (row.rows.length === 0) return { ok: false, error: "Role not found" };

  const raw = row.rows[0].permissions;
  let current: string[] = [];
  if (Array.isArray(raw)) current = raw.map(String);
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) current = parsed.map(String);
    } catch {
      current = [];
    }
  }

  const has = current.includes(perm);
  let next: string[];
  if (enabled && !has) next = [...current, perm];
  else if (!enabled && has) next = current.filter((p) => p !== perm);
  else next = current;

  if (next !== current) {
    await db().execute({
      sql: "UPDATE roles SET permissions = ? WHERE slug = ?",
      args: [JSON.stringify(next), slug]
    });
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: enabled ? "roles.permission_grant" : "roles.permission_revoke",
      targetType: "role",
      targetId: slug,
      diff: { permission: perm }
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}
