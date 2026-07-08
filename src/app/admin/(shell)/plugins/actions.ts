"use server";

import { revalidatePath } from "next/cache";
import { drizzle as drizzleLibSql } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { plugins } from "@core/db/schema/plugins";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { discoveredPlugins } from "@/generated/plugins";
import { bootEngine, getBootBus } from "@core/boot";
import { loadPluginLive, unloadPluginLive } from "@core/plugins/loader";
import { invalidateEnabledPluginsCache } from "@core/plugins/enabled-cache";
import { reserveSlug, releaseSlug } from "@core/slugs/registry";

export type SaveResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Plugin list
// ---------------------------------------------------------------------------

export interface PluginListItem {
  slug: string;
  name: string;
  version: string;
  enabled: boolean;
  type: "system" | "custom";
  tier: "essential" | "standard";
  failureCount: number;
  installedAt: string;
  /**
   * Path to the plugin's admin page when its manifest declares one
   * (`capabilities.registers_admin_menu === true` + `admin` block).
   * `null` when the plugin doesn't expose any admin chrome — drives
   * whether the row renders the "Settings" cog.
   */
  adminHref: string | null;
}

/** Build the source map: which plugins come from core-plugins vs plugins/ */
function getSourceMap(): Map<string, "system" | "custom"> {
  const map = new Map<string, "system" | "custom">();
  for (const entry of discoveredPlugins) {
    // The generated file imports from @core-plugins/* or @plugins/*
    // We can check the manifest slug against known core plugin slugs
    // by checking if the entry's migrationsDir starts with "src/core-plugins/"
    const isCore = entry.migrationsDir
      ? entry.migrationsDir.startsWith("src/core-plugins/")
      : true; // plugins without migrations dir — check slug against known cores
    map.set(entry.manifest.slug, isCore ? "system" : "custom");
  }
  return map;
}

export async function getPlugins(): Promise<PluginListItem[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = await drizzleLibSql(db())
    .select({
      slug: plugins.slug,
      version: plugins.version,
      enabled: plugins.enabled,
      failureCount: plugins.failureCount,
      installedAt: plugins.installedAt,
    })
    .from(plugins)
    .orderBy(plugins.slug);

  const sourceMap = getSourceMap();
  const manifestMap = new Map(
    discoveredPlugins.map((d) => [d.manifest.slug, d.manifest])
  );

  return rows
    // Themes share the discovery + plugins-table machinery but are
    // managed under /admin/themes; hide them from the Plugins list.
    .filter((r) => manifestMap.get(r.slug)?.type !== "theme")
    .map((r) => {
      const slug = r.slug;
      const manifest = manifestMap.get(slug);
      const declaresAdmin =
        manifest?.capabilities?.registers_admin_menu === true && manifest.admin != null;
      return {
        slug,
        name: manifest?.name ?? slug,
        version: r.version,
        enabled: Boolean(r.enabled),
        type: sourceMap.get(slug) ?? "system",
        tier: (manifest?.tier ?? "standard") as "essential" | "standard",
        failureCount: Number(r.failureCount ?? 0),
        installedAt: String(r.installedAt),
        adminHref: declaresAdmin ? `/admin/plugins/${slug}` : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Toggle plugin enabled/disabled
// ---------------------------------------------------------------------------

export async function togglePlugin(
  slug: string,
  enabled: boolean
): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can manage plugins" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  // Prevent disabling essential/core plugins
  const manifest = discoveredPlugins.find((d) => d.manifest.slug === slug);
  // Themes ride the same plugins table but are managed under /admin/themes.
  // Refuse to toggle them through the plugins API.
  if (manifest?.manifest.type === "theme") {
    return { ok: false, error: "Themes are managed under /admin/themes" };
  }
  if (manifest?.manifest.tier === "essential") {
    return { ok: false, error: "Essential plugins cannot be disabled" };
  }

  const actorId = await resolveUserId(db(), session.user);

  try {
    await drizzleLibSql(db())
      .update(plugins)
      .set({ enabled, updatedAt: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(plugins.slug, slug));
    invalidateEnabledPluginsCache();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Toggle failed" };
  }

  // Live load/unload so the change takes effect without a server restart.
  // bootEngine() is idempotent and globalThis-pinned, so awaiting it here
  // is safe whether boot already finished or is in flight.
  await bootEngine();
  const bus = getBootBus();
  if (bus) {
    if (enabled) {
      const live = await loadPluginLive(
        {
          db: db(),
          bus,
          discovered: discoveredPlugins,
          reserveSlug: (input) => reserveSlug(db(), input),
          releaseSlug: async (slug, source) => {
            await releaseSlug(db(), { slug, source });
          },
        },
        slug
      );
      if (!live.ok) {
        // Plugin's register() threw or migrations failed. The DB flag is
        // already flipped — leave it on so the user can retry from the UI
        // once they've fixed the cause; the failure is visible via the
        // failure_count badge in the plugins table.
        return { ok: false, error: live.error };
      }
    } else {
      unloadPluginLive({ bus }, slug);
    }
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: enabled ? "plugin.enabled" : "plugin.disabled",
      targetType: "plugin",
      targetId: slug,
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/plugins");
  revalidatePath("/admin");
  // Sidebar entries are read in the (shell) layout, so layout-level revalidate
  // is required for the sidebar to pick up the new plugin without a refresh.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete a custom plugin (only non-system)
// ---------------------------------------------------------------------------

export async function deletePlugin(slug: string): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can delete plugins" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  // Themes ride the same plugins table but are managed under /admin/themes.
  // Refuse to delete them through the plugins API.
  const manifest = discoveredPlugins.find((d) => d.manifest.slug === slug);
  if (manifest?.manifest.type === "theme") {
    return { ok: false, error: "Themes are managed under /admin/themes" };
  }

  // Check it's a custom plugin
  const sourceMap = getSourceMap();
  if (sourceMap.get(slug) === "system") {
    return { ok: false, error: "System plugins cannot be deleted" };
  }

  const actorId = await resolveUserId(db(), session.user);

  try {
    await drizzleLibSql(db()).delete(plugins).where(eq(plugins.slug, slug));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "plugin.deleted",
      targetType: "plugin",
      targetId: slug,
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/plugins");
  revalidatePath("/admin");
  return { ok: true };
}
