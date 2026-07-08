import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import {
  getPostsPermissions,
  getPostDetail,
  getAuthorOptions,
  getInstalledSchemas,
  getPillarOptions,
  getAssignableTopics,
} from "../../actions";
import { getRevisions } from "@core/revisions/service";
import { getContentSettings } from "../../../settings/content-actions";
import { PostEditForm } from "../../PostEditForm";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPostsPermissions();
  if (!permissions.userId) redirect("/admin");

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const [
    detail,
    authorOptions,
    installedSchemas,
    contentSettings,
    pillars,
    topics,
    postTemplates,
    pillarTemplates,
    revisions,
  ] = await Promise.all([
    getPostDetail(id),
    getAuthorOptions(),
    getInstalledSchemas(),
    getContentSettings(),
    getPillarOptions(),
    getAssignableTopics(),
    listActiveCustomsForParent(db(), "single-post"),
    listActiveCustomsForParent(db(), "single-pillar"),
    getRevisions(db(), "post", id, 1),
  ]);
  if (!detail) notFound();

  return (
    <PostEditForm
      mode="edit"
      initial={detail}
      permissions={permissions}
      authorOptions={authorOptions}
      installedSchemas={installedSchemas}
      pillars={pillars}
      topics={topics}
      postTemplates={postTemplates}
      pillarTemplates={pillarTemplates}
      inspectorPosition={contentSettings.editorInspectorPosition}
      hasHistory={revisions.length > 0}
    />
  );
}
