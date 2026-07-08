import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getThemes } from "./actions";
import { ThemesPageClient } from "./ThemesPageClient";

export const metadata: Metadata = { title: "Themes" };

export default async function ThemesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) redirect("/admin");

  const themes = await getThemes();
  return <ThemesPageClient initial={themes} />;
}
