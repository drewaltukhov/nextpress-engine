import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getMenu } from "@core-plugins/menus";
import { getPanel, MEGA_LAYOUT_REGISTRY } from "@core-plugins/mega-menu";
import { loadTopLevelItem, loadEditorPickerOptions } from "./actions";
import { MegaPanelEditClient, type LayoutMeta } from "./MegaPanelEditClient";

export const metadata: Metadata = { title: "Edit mega panel" };

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

export default async function EditMegaPanelPage({ params }: RouteParams) {
  const { id: idParam, itemId: itemIdParam } = await params;
  const menuId = Number(idParam);
  const itemId = Number(itemIdParam);
  if (!Number.isFinite(menuId) || !Number.isFinite(itemId)) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "menus.manage")) redirect("/admin");

  const [menu, item, panel, picker] = await Promise.all([
    getMenu(db(), menuId),
    loadTopLevelItem(menuId, itemId),
    getPanel(db(), itemId),
    loadEditorPickerOptions(),
  ]);
  if (!menu || !item) notFound();

  // Strip the registry to its serializable surface — Render/parseConfig
  // are server-only fns; the client form just needs id/name/description/
  // thumbnailSvg.
  const layouts: LayoutMeta[] = MEGA_LAYOUT_REGISTRY.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    thumbnailSvg: l.thumbnailSvg,
  }));

  return (
    <MegaPanelEditClient
      menuId={menuId}
      itemId={itemId}
      menuName={menu.name}
      itemLabel={item.label}
      layouts={layouts}
      posts={picker.posts}
      topics={picker.topics}
      pillars={picker.pillars}
      initial={
        panel
          ? { layoutId: panel.layoutId, config: panel.config, widthMode: panel.widthMode }
          : null
      }
    />
  );
}
