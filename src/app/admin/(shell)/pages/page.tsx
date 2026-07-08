import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import { getPagesList, getPagesAuthors, getPagesPermissions } from "./actions";
import { PagesPageClient } from "./PagesPageClient";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPagesPermissions();
  // Redirect when actor has neither pages.new nor pages.draft. The actions
  // module returns userId: null in that case.
  if (!permissions.userId) redirect("/admin");

  const [initialList, authors, pageTemplates] = await Promise.all([
    getPagesList(),
    getPagesAuthors(),
    listActiveCustomsForParent(db(), "single-page"),
  ]);

  return (
    <PagesPageClient
      permissions={permissions}
      initial={initialList}
      authors={authors}
      pageTemplates={pageTemplates}
    />
  );
}
