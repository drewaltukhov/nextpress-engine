import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getMenusList } from "./actions";
import { MenusPageClient } from "./MenusPageClient";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "menus.manage")) redirect("/admin");

  const menus = await getMenusList();
  return <MenusPageClient initial={menus} />;
}
