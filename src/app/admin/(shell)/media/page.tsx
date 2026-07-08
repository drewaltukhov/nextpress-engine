import type { Metadata } from "next";
import { auth } from "@core/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLibrary, getMediaPermissions, getMediaSettings } from "./actions";
import { getGalleries } from "./galleries/actions";
import { MediaPageClient } from "./MediaPageClient";
import { R2Storage } from "@core-plugins/media/storage/r2";
import { getMigrationStats } from "@core-plugins/media/migrate";
import { db as getDb } from "@core/db/instance";
import {
  DEFAULT_THUMB_SIZE_LEVEL,
  THUMB_SIZE_COOKIE,
  clampThumbSize,
} from "./thumb-size";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const [permissions, library, settings, galleries, sp, cookieStore] = await Promise.all([
    getMediaPermissions(),
    getLibrary(1),
    getMediaSettings(),
    getGalleries(),
    searchParams,
    cookies(),
  ]);

  const cookieValue = cookieStore.get(THUMB_SIZE_COOKIE)?.value;
  const initialThumbSize = cookieValue
    ? clampThumbSize(Number(cookieValue))
    : DEFAULT_THUMB_SIZE_LEVEL;

  const r2Available = new R2Storage().available();
  const initialMigrationStats = await getMigrationStats(getDb());

  return (
    <MediaPageClient
      permissions={permissions}
      initialLibrary={library}
      initialSettings={settings}
      initialGalleries={galleries}
      defaultTab={sp.tab}
      initialThumbSize={initialThumbSize}
      r2Available={r2Available}
      initialMigrationStats={initialMigrationStats}
    />
  );
}
