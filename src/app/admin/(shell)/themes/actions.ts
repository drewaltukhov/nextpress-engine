"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  listThemes,
  listThemeData,
  setActiveThemeSlug,
  setThemeData,
  resetThemeData,
  applyThemeDefaults,
  getThemeDefaults,
  getThemeListItem,
  type ThemeListItem,
  type ThemeDataValue,
  type ThemeDataKind,
} from "@core-plugins/themes";

export type SaveResult = { ok: true } | { ok: false; error: string };

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) {
    return { ok: false, error: "You don't have permission to manage themes" };
  }
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

export async function getThemes(): Promise<ThemeListItem[]> {
  return listThemes(db());
}

/**
 * Flip the active theme. Passing null clears the active flag, which falls
 * the public site back to the legacy hardcoded shell. Revalidates the
 * public surface so the new (or cleared) theme takes effect immediately
 * on the next request — caches don't strand visitors on the old chrome.
 */
export async function activateThemeAction(slug: string | null): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await setActiveThemeSlug(db(), slug, { updatedBy: guard.userId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to activate theme" };
  }

  if (slug) {
    try {
      await applyThemeDefaults(db(), slug, {
        onlyMissingOrEmpty: true,
        updatedBy: guard.userId,
      });
    } catch {
      // Theme didn't register defaults (third-party theme); not fatal.
    }
  }

  // Resolve the theme's display name so the activity feed shows
  // "NextPresso" rather than the raw slug. Lookup is per-action so
  // failure to read the manifest isn't load-bearing on activation.
  let themeName: string | null = null;
  if (slug) {
    try {
      const item = await getThemeListItem(db(), slug);
      themeName = item?.name ?? null;
    } catch { /* audit non-fatal */ }
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: slug ? "themes.activated" : "themes.deactivated",
      targetType: "theme",
      targetId: slug ?? "(none)",
      // The activity-log reader picks `parsed.title` first, then
      // `parsed.name` — surface the human-readable name so the
      // feed reads "NextPresso" instead of "Theme: nextpresso".
      diff: { activeSlug: slug, name: themeName ?? slug ?? undefined },
    });
  } catch {
    // Audit failure must not block activation
  }

  // Revalidate every public surface that the theme would chrome.
  revalidatePath("/", "layout");
  revalidatePath("/admin/themes");
  return { ok: true };
}

export async function getAllThemeData(slug: string): Promise<ThemeDataValue[]> {
  return listThemeData(db(), slug);
}

export async function saveThemeDataAction(
  slug: string,
  kind: ThemeDataKind,
  name: string,
  puckData: unknown,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await setThemeData(db(), slug, kind, name, puckData, { updatedBy: guard.userId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "themes.builder.saved",
      targetType: "theme_data",
      targetId: `${slug}:${kind}:${name}`,
    });
  } catch {}
  // NOTE: revalidatePath moved to `revalidateThemePathsAction` so the
  // client can call it ONCE after all dirty rows have been saved,
  // instead of 2×N times for N dirty rows. Caller MUST invoke that
  // action after a successful save batch.
  return { ok: true };
}

/**
 * Single revalidation call for the builder's save flow. Invalidates the
 * public-layout cache (so the live site picks up theme changes on next
 * request) plus the builder's own page cache. The builder calls this
 * once per save click — keeping it out of `saveThemeDataAction` saves
 * 2 × (dirty-rows − 1) redundant invalidations on multi-row saves.
 */
export async function revalidateThemePathsAction(slug: string): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  revalidatePath("/", "layout");
  revalidatePath(`/admin/themes/${slug}/builder`);
  return { ok: true };
}

export async function resetThemeDataAction(
  slug: string,
  kind: ThemeDataKind,
  name: string,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await resetThemeData(db(), slug, kind, name);
    // If the theme registered a default for this row, re-apply it so
    // the next render shows the canonical starter content rather than
    // a blank slot.
    const defaults = getThemeDefaults(slug);
    if (defaults) {
      const data = kind === "part" ? defaults.parts[name] : defaults.templates[name];
      if (data) {
        await setThemeData(db(), slug, kind, name, data, { updatedBy: guard.userId });
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Reset failed" };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "themes.builder.defaults_restored",
      targetType: "theme_data",
      targetId: `${slug}:${kind}:${name}`,
    });
  } catch {}
  revalidatePath("/", "layout");
  revalidatePath(`/admin/themes/${slug}/builder`);
  return { ok: true };
}
