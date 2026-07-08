import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getMenuDetail } from "../../actions";
import { loadMenuItemPickerOptions } from "../../picker-actions";
import { getPanelsByMenu } from "@core-plugins/mega-menu";
import { MenuEditForm } from "./MenuEditForm";

export const metadata: Metadata = { title: "Edit menu" };

interface RouteParams {
  params: Promise<{ id: string }>;
}

export default async function EditMenuPage({ params }: RouteParams) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "menus.manage")) redirect("/admin");

  const [menu, picker, panels] = await Promise.all([
    getMenuDetail(id),
    loadMenuItemPickerOptions(),
    // Single batched fetch — fills the per-row "Edit mega panel" affordance
    // in MenuEditForm without N queries.
    getPanelsByMenu(db(), id),
  ]);
  if (!menu) notFound();

  const itemsWithPanels = Array.from(panels.keys());

  return (
    <MenuEditForm
      initial={menu}
      pickerOptions={picker}
      itemsWithPanels={itemsWithPanels}
    />
  );
}
