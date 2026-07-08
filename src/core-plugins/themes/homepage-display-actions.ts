"use server";

import { z } from "zod";
import { db } from "@core/db/instance";
import { auth } from "@core/auth";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

export interface HomepageDisplayOptions {
  layout: "list" | "grid" | "plain";
  limit: number;
  showThumbnail: boolean;
  showTopic: boolean;
  showDate: boolean;
  gridColumns: 2 | 3 | 4;
  gridAspect: "rectangle" | "square";
  paginationEnabled: boolean;
  paginationStyle: "numbered" | "arrows";
  paginationType: "buttons" | "links";
  paginationAlign: "left" | "center" | "right";
}

const SCHEMAS = {
  layout: z.enum(["list", "grid", "plain"]),
  limit: z.number().int().min(1).max(50),
  showThumbnail: z.boolean(),
  showTopic: z.boolean(),
  showDate: z.boolean(),
  gridColumns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  gridAspect: z.enum(["rectangle", "square"]),
  paginationEnabled: z.boolean(),
  paginationStyle: z.enum(["numbered", "arrows"]),
  paginationType: z.enum(["buttons", "links"]),
  paginationAlign: z.enum(["left", "center", "right"]),
} as const satisfies Record<keyof HomepageDisplayOptions, z.ZodTypeAny>;

const DEFAULTS: HomepageDisplayOptions = {
  layout: "grid",
  limit: 12,
  showThumbnail: true,
  showTopic: false,
  // Default on so existing homepages keep their date line — matches the
  // legacy behavior where PostListView always rendered the date when
  // `publishedAt` was set.
  showDate: true,
  gridColumns: 2,
  gridAspect: "rectangle",
  paginationEnabled: false,
  paginationStyle: "numbered",
  paginationType: "buttons",
  paginationAlign: "center",
};

const KEY_MAP: Record<keyof HomepageDisplayOptions, string> = {
  layout: "content.home_layout",
  limit: "content.home_limit",
  showThumbnail: "content.home_show_thumbnail",
  showTopic: "content.home_show_topic",
  showDate: "content.home_show_date",
  gridColumns: "content.home_grid_columns",
  gridAspect: "content.home_grid_aspect",
  paginationEnabled: "content.home_pagination_enabled",
  paginationStyle: "content.home_pagination_style",
  paginationType: "content.home_pagination_type",
  paginationAlign: "content.home_pagination_align",
};

/**
 * Read all homepage display settings, applying defaults for any unset
 * key. Pure read — no auth check (the public renderer also calls this
 * via `renderActiveTheme`).
 */
export async function getHomepageDisplayOptions(): Promise<HomepageDisplayOptions> {
  const dbInstance = db();
  const entries = await Promise.all(
    (Object.keys(KEY_MAP) as Array<keyof HomepageDisplayOptions>).map(async (key) => {
      const raw = await getSetting(dbInstance, KEY_MAP[key]);
      const parsed = SCHEMAS[key].safeParse(raw);
      return [key, parsed.success ? parsed.data : DEFAULTS[key]] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as HomepageDisplayOptions;
}

export type SetHomepageDisplayResult = { ok: true } | { ok: false; error: string };

/**
 * Write one display option. Permissioned: requires `settings.manage`.
 * Validates against the registered schema before writing.
 */
export async function setHomepageDisplayOption<K extends keyof HomepageDisplayOptions>(
  key: K,
  value: HomepageDisplayOptions[K],
): Promise<SetHomepageDisplayResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "settings.manage")) {
    return { ok: false, error: "You don't have permission to change homepage display settings" };
  }

  const parsed = SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: `Invalid value for ${key}: ${parsed.error.message}` };
  }

  const opts = { updatedBy: session.user.id };
  await setSetting(db(), KEY_MAP[key], parsed.data, opts);
  return { ok: true };
}
