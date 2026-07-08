import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getMediaById } from "@core-plugins/media/service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import { getMediaPermissions } from "../actions";
import { MediaDetailClient } from "./MediaDetailClient";

export const metadata: Metadata = { title: "Media item" };

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const { id } = await params;
  const media = await getMediaById(db(), id);
  if (!media) notFound();

  const perms = await getMediaPermissions();
  const canDelete =
    perms.canDeleteAny || (!!perms.userId && media.uploadedBy === perms.userId);

  // Build absolute URLs the user can paste anywhere. All public media URLs
  // are now /media/<id>(/thumb) regardless of backend — the route handlers
  // dispatch to bytes or R2 internally — so we just prefix the request host.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  return (
    <MediaDetailClient
      media={media}
      canDelete={canDelete}
      fullUrl={`${baseUrl}${getMediaPublicUrl({ id: media.id, hasThumb: media.hasThumb, variant: "original", contentVersion: media.contentVersion })}`}
      thumbUrl={`${baseUrl}${getMediaPublicUrl({ id: media.id, hasThumb: media.hasThumb, variant: "thumb", contentVersion: media.contentVersion })}`}
    />
  );
}
