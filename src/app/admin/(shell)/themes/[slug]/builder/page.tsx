import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  getThemeListItem,
  applyThemeDefaults,
  TEMPLATE_IDS,
  SIDEBAR_SIDES,
} from "@core-plugins/themes";
import { listTemplates } from "@core-plugins/themes/service";
import { getSetting } from "@core-plugins/settings/registry";
import { getAllThemeData } from "../../actions";
import {
  ThemeBuilderClient,
  type SidebarVisibility,
  type CustomSidebarFlags,
} from "./ThemeBuilderClient";

export const metadata: Metadata = { title: "Theme builder" };

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function ThemeBuilderPage({ params }: RouteParams) {
  const { slug } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) redirect("/admin");

  // Backfill any template/part rows the theme's defaults define but
  // that aren't in the DB yet — happens when new templates land in a
  // theme update (e.g. Search Results / Author added after the theme
  // was already activated). `onlyMissingOrEmpty: true` means existing
  // user content is never overwritten; the call is a no-op once every
  // row has content.
  await applyThemeDefaults(db(), slug, {
    onlyMissingOrEmpty: true,
    updatedBy: session.user.id,
  });

  // Custom templates must be loaded first so the visibility / custom-mode
  // loaders can seed entries for their slugs too. Without this, switching
  // to a custom template in the builder would crash when looking up its
  // sidebar visibility entry.
  const { customsByParent } = await listTemplates(db(), slug);
  const customs = Object.values(customsByParent).flat().map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
    parentTemplate: c.parentTemplate,
  }));
  const customSlugs = customs.map((c) => c.slug);

  const [theme, savedRows, sidebarVisibility, customSidebarFlags, themeLogoRaw] = await Promise.all([
    getThemeListItem(db(), slug),
    getAllThemeData(slug),
    loadSidebarVisibility(slug, customSlugs),
    loadCustomSidebarFlags(slug, customSlugs),
    getSetting<string>(db(), `theme.${slug}.logo_media_id`),
  ]);
  if (!theme) notFound();

  return (
    <ThemeBuilderClient
      theme={theme}
      savedRows={savedRows}
      sidebarVisibility={sidebarVisibility}
      customSidebarFlags={customSidebarFlags}
      themeLogoUrl={typeof themeLogoRaw === "string" ? themeLogoRaw : ""}
      customs={customs}
    />
  );
}

/** Pull every per-template `custom_*_sidebar` opt-in flag for this
 *  theme in one parallel batch. Default `false` (inherit shared
 *  default) if no setting row exists yet. */
async function loadCustomSidebarFlags(
  slug: string,
  customSlugs: string[] = [],
): Promise<CustomSidebarFlags> {
  const allIds = [...TEMPLATE_IDS, ...customSlugs];
  const tasks: Promise<{ tid: string; side: string; value: boolean }>[] = [];
  for (const tid of allIds) {
    for (const side of SIDEBAR_SIDES) {
      tasks.push(
        (async () => {
          const v = await getSetting<boolean>(
            db(),
            `theme.${slug}.template.${tid}.custom_${side}_sidebar`,
          );
          return { tid, side, value: v ?? false };
        })(),
      );
    }
  }
  const results = await Promise.all(tasks);
  const out: CustomSidebarFlags = {};
  for (const tid of allIds) {
    out[tid] = { left: false, right: false };
  }
  for (const r of results) {
    out[r.tid][r.side as "left" | "right"] = r.value;
  }
  return out;
}

/** Pull every per-template sidebar visibility flag for this theme in one
 *  parallel batch. Defaults to true if no setting row exists yet. */
async function loadSidebarVisibility(
  slug: string,
  customSlugs: string[] = [],
): Promise<SidebarVisibility> {
  const allIds = [...TEMPLATE_IDS, ...customSlugs];
  const tasks: Promise<{ tid: string; side: string; value: boolean }>[] = [];
  for (const tid of allIds) {
    for (const side of SIDEBAR_SIDES) {
      tasks.push(
        (async () => {
          const v = await getSetting<boolean>(
            db(),
            `theme.${slug}.template.${tid}.show_${side}_sidebar`,
          );
          return { tid, side, value: v ?? true };
        })(),
      );
    }
  }
  const results = await Promise.all(tasks);
  const out: SidebarVisibility = {};
  for (const tid of allIds) {
    out[tid] = { left: true, right: true };
  }
  for (const r of results) {
    out[r.tid][r.side as "left" | "right"] = r.value;
  }
  return out;
}
