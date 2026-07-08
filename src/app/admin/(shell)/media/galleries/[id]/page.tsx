import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getGallery } from "@core-plugins/galleries";
import { GalleryEditPageClient } from "./GalleryEditPageClient";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "galleries.manage")) redirect("/admin/media");

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const gallery = await getGallery(db(), id);
  if (!gallery) notFound();

  return <GalleryEditPageClient initial={gallery} />;
}
