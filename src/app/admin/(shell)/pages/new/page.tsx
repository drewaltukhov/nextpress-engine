import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import { getPagesPermissions, getAuthorOptions, getInstalledSchemas } from "../actions";
import { getContentSettings } from "../../settings/content-actions";
import { PageEditForm } from "../PageEditForm";

export const metadata: Metadata = { title: "New page" };

export default async function NewPagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPagesPermissions();
  if (!permissions.userId) redirect("/admin");

  const [authorOptions, installedSchemas, contentSettings, pageTemplates] = await Promise.all([
    getAuthorOptions(),
    getInstalledSchemas(),
    getContentSettings(),
    listActiveCustomsForParent(db(), "single-page"),
  ]);

  return (
    <PageEditForm
      mode="new"
      permissions={permissions}
      authorOptions={authorOptions}
      installedSchemas={installedSchemas}
      pageTemplates={pageTemplates}
      inspectorPosition={contentSettings.editorInspectorPosition}
    />
  );
}
