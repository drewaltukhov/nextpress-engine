import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import {
  getPostsPermissions,
  getAuthorOptions,
  getInstalledSchemas,
  getPillarOptions,
  getAssignableTopics,
} from "../actions";
import { getContentSettings } from "../../settings/content-actions";
import { PostEditForm } from "../PostEditForm";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPostsPermissions();
  if (!permissions.userId) redirect("/admin");

  const [
    authorOptions,
    installedSchemas,
    contentSettings,
    pillars,
    topics,
    postTemplates,
    pillarTemplates,
  ] = await Promise.all([
    getAuthorOptions(),
    getInstalledSchemas(),
    getContentSettings(),
    getPillarOptions(),
    getAssignableTopics(),
    listActiveCustomsForParent(db(), "single-post"),
    listActiveCustomsForParent(db(), "single-pillar"),
  ]);

  return (
    <PostEditForm
      mode="new"
      permissions={permissions}
      authorOptions={authorOptions}
      installedSchemas={installedSchemas}
      pillars={pillars}
      topics={topics}
      postTemplates={postTemplates}
      pillarTemplates={pillarTemplates}
      inspectorPosition={contentSettings.editorInspectorPosition}
    />
  );
}
