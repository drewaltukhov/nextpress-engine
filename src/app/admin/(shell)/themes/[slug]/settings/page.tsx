import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getThemeListItem } from "@core-plugins/themes";
import { listTemplates } from "@core-plugins/themes/service";
import { getThemeSettings } from "./actions";
import { ThemeSettingsClient } from "./ThemeSettingsClient";

export const metadata: Metadata = { title: "Theme settings" };

interface RouteParams {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ThemeSettingsPage({ params, searchParams }: RouteParams) {
  const { slug } = await params;
  const { tab } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) redirect("/admin");

  const [theme, settings, templatesResult] = await Promise.all([
    getThemeListItem(db(), slug),
    getThemeSettings(slug),
    listTemplates(db(), slug),
  ]);
  if (!theme) notFound();

  return (
    <ThemeSettingsClient
      theme={theme}
      initial={settings}
      customs={templatesResult.customsByParent}
      defaultTab={tab}
    />
  );
}
