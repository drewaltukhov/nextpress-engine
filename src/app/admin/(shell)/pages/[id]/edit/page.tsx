import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import {
  getPagesPermissions,
  getPageDetail,
  getAuthorOptions,
  getInstalledSchemas,
} from "../../actions";
import { getRevisions } from "@core/revisions/service";
import { getContentSettings } from "../../../settings/content-actions";
import { PageEditForm } from "../../PageEditForm";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPagesPermissions();
  if (!permissions.userId) redirect("/admin");

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const [detail, authorOptions, installedSchemas, contentSettings, pageTemplates, revisions] = await Promise.all([
    getPageDetail(id),
    getAuthorOptions(),
    getInstalledSchemas(),
    getContentSettings(),
    listActiveCustomsForParent(db(), "single-page"),
    getRevisions(db(), "page", id, 1),
  ]);
  // getPageDetail returns null if the page doesn't exist OR the actor
  // can't edit it (draft-only user looking at someone else's row). Both
  // cases land here as 404 — surfacing "you can't edit this" would be
  // a leak about pages that exist outside the actor's scope.
  if (!detail) notFound();

  return (
    <PageEditForm
      mode="edit"
      initial={detail}
      permissions={permissions}
      authorOptions={authorOptions}
      installedSchemas={installedSchemas}
      pageTemplates={pageTemplates}
      inspectorPosition={contentSettings.editorInspectorPosition}
      hasHistory={revisions.length > 0}
    />
  );
}
