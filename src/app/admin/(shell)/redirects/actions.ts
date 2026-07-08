"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import {
  listRedirects,
  createRedirect,
  setRedirectActive,
  deleteRedirect,
  RedirectCycleError,
  type RedirectListItem,
  type RedirectListFilters,
  type RedirectSource,
} from "@core-plugins/redirects";

export type SaveResult = { ok: true } | { ok: false; error: string };

const VALID_STATUSES = [301, 302, 307, 308, 410] as const;
const VALID_DEFAULT_STATUSES = [301, 302, 307, 308] as const;
const VALID_SOURCES: RedirectSource[] = [
  "manual",
  "permalink_change",
  "slug_change",
  "media_rename",
];

/**
 * Inline admin guard. Returns the resolved DB user ID on success, or a
 * SaveResult error to be returned directly by the caller.
 */
async function requireAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can manage redirects" };
  }
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

// ---------------------------------------------------------------------------
// Manage tab — list / create / toggle / delete
// ---------------------------------------------------------------------------

export async function getRedirects(
  filters: RedirectListFilters = {}
): Promise<RedirectListItem[]> {
  const safe: RedirectListFilters = {};
  if (filters.search) safe.search = filters.search;
  if (filters.source && VALID_SOURCES.includes(filters.source)) {
    safe.source = filters.source;
  }
  return listRedirects(db(), safe);
}

export interface CreateRedirectFormInput {
  fromPath: string;
  toPath: string;
  status: number;
  notes: string;
}

export async function createRedirectAction(
  input: CreateRedirectFormInput
): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  const fromPath = input.fromPath?.trim() ?? "";
  const toPath = input.toPath?.trim() ?? "";
  const notes = input.notes?.trim() ?? "";

  if (!fromPath) return { ok: false, error: "From path is required" };
  if (!fromPath.startsWith("/")) {
    return { ok: false, error: "From path must start with /" };
  }
  if (!toPath) return { ok: false, error: "To path is required" };
  if (!VALID_STATUSES.includes(input.status as (typeof VALID_STATUSES)[number])) {
    return { ok: false, error: "Invalid status code" };
  }
  if (fromPath === toPath) {
    return { ok: false, error: "From and to paths must differ" };
  }

  const { userId } = guard;

  let id: number;
  try {
    id = await createRedirect(db(), {
      fromPath,
      toPath,
      status: input.status,
      source: "manual",
      notes: notes || null,
      createdBy: userId,
    });
  } catch (err) {
    if (err instanceof RedirectCycleError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "redirects.created",
      targetType: "redirect",
      targetId: String(id),
      diff: { fromPath, toPath, status: input.status, notes: notes || null },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/redirects");
  return { ok: true };
}

export async function toggleRedirectActiveAction(
  id: number,
  active: boolean
): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  const { userId } = guard;

  try {
    await setRedirectActive(db(), id, active);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Toggle failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: active ? "redirects.activated" : "redirects.deactivated",
      targetType: "redirect",
      targetId: String(id),
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/redirects");
  return { ok: true };
}

export async function deleteRedirectAction(id: number): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  const { userId } = guard;

  try {
    await deleteRedirect(db(), id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "redirects.deleted",
      targetType: "redirect",
      targetId: String(id),
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/redirects");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings tab — auto-create toggles + default status
// ---------------------------------------------------------------------------

export interface RedirectsSettings {
  defaultStatus: number;
  autoOnSlugChange: boolean;
  autoOnPermalinkChange: boolean;
  autoOnMediaRename: boolean;
}

export async function getRedirectsSettings(): Promise<RedirectsSettings> {
  const [defaultStatus, slugChange, permalinkChange, mediaRename] = await Promise.all([
    getSetting<number>(db(), "redirects.default_status"),
    getSetting<boolean>(db(), "redirects.auto_on_slug_change"),
    getSetting<boolean>(db(), "redirects.auto_on_permalink_change"),
    getSetting<boolean>(db(), "redirects.auto_on_media_rename"),
  ]);
  return {
    defaultStatus: defaultStatus ?? 301,
    autoOnSlugChange: slugChange ?? true,
    autoOnPermalinkChange: permalinkChange ?? true,
    autoOnMediaRename: mediaRename ?? true,
  };
}

export async function saveRedirectsSettings(
  input: RedirectsSettings
): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  if (
    !VALID_DEFAULT_STATUSES.includes(
      input.defaultStatus as (typeof VALID_DEFAULT_STATUSES)[number]
    )
  ) {
    return { ok: false, error: "Default status must be 301, 302, 307, or 308" };
  }

  const { userId } = guard;
  const opts = { updatedBy: userId };

  try {
    await setSetting(db(), "redirects.default_status", input.defaultStatus, opts);
    await setSetting(db(), "redirects.auto_on_slug_change", input.autoOnSlugChange, opts);
    await setSetting(db(), "redirects.auto_on_permalink_change", input.autoOnPermalinkChange, opts);
    await setSetting(db(), "redirects.auto_on_media_rename", input.autoOnMediaRename, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.redirects.update",
      targetType: "settings",
      targetId: "redirects",
      diff: input,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/redirects");
  return { ok: true };
}
