"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { saveRevision, getRevisions, getRevision, type RevisionRow } from "@core/revisions/service";
import { updatePost, updatePostSeo, setPostStatus } from "@core-plugins/posts";
import { updatePage, updatePageSeo, setPageStatus } from "@core-plugins/pages";

type SaveRevisionResult = { ok: true } | { ok: false; error: string };
type GetRevisionsResult =
  | { ok: true; revisions: RevisionRow[] }
  | { ok: false; error: string };
type GetRevisionResult =
  | { ok: true; revision: RevisionRow }
  | { ok: false; error: string };

export async function saveRevisionAction(
  kind: "post" | "page",
  contentId: number,
  snapshot: unknown,
): Promise<SaveRevisionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  const userId = await resolveUserId(db(), session.user);
  try {
    await saveRevision(db(), kind, contentId, snapshot, userId);
    return { ok: true };
  } catch (err) {
    console.error("saveRevisionAction:", err);
    return { ok: false, error: "Failed to save revision" };
  }
}

export async function getRevisionsAction(
  kind: "post" | "page",
  contentId: number,
): Promise<GetRevisionsResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  try {
    const revisions = await getRevisions(db(), kind, contentId);
    return { ok: true, revisions };
  } catch (err) {
    console.error("getRevisionsAction:", err);
    return { ok: false, error: "Failed to fetch revisions" };
  }
}

export async function getRevisionAction(
  revisionId: number,
): Promise<GetRevisionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  try {
    const revision = await getRevision(db(), revisionId);
    if (!revision) return { ok: false, error: "Revision not found" };
    return { ok: true, revision };
  } catch (err) {
    console.error("getRevisionAction:", err);
    return { ok: false, error: "Failed to fetch revision" };
  }
}

export async function restoreBlockAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);
  const kind = formData.get("kind") as "post" | "page";
  const contentId = Number(formData.get("contentId"));
  const newContentJson = formData.get("newContentJson") as string;
  if (kind === "post") {
    await updatePost(db(), contentId, { contentJson: newContentJson });
    revalidatePath(`/admin/posts/${contentId}/history`);
    revalidatePath(`/admin/posts/${contentId}/edit`);
  } else {
    await updatePage(db(), contentId, { contentJson: newContentJson });
    revalidatePath(`/admin/pages/${contentId}/history`);
    revalidatePath(`/admin/pages/${contentId}/edit`);
  }
}

export async function restorePostRevisionAction(
  postId: number,
  revisionId: number,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);

  const revision = await getRevision(db(), revisionId);
  if (!revision) throw new Error("Revision not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = JSON.parse(revision.snapshot) as Record<string, any>;

  await updatePost(db(), postId, {
    title: s.title,
    contentJson: s.contentJson,
    postKind: s.postKind,
    parentId: s.parentId ?? null,
    template: s.template || null,
    createdBy: s.authorId || undefined,
    publishedAt: s.postDate ? new Date(s.postDate).toISOString() : null,
    featuredImage: s.featuredImage || null,
    excerpt: s.excerpt || null,
    schemaTypes: Array.isArray(s.schemaTypes) ? s.schemaTypes : [],
    topicIds: Array.isArray(s.topicIds) ? s.topicIds : [],
  });

  await updatePostSeo(db(), postId, {
    seoTitle: s.seoTitleDirty ? (s.seoTitleExplicit || null) : null,
    seoDescription: s.seoDescription || null,
    seoOgImage: s.seoOgImage || null,
    seoRobots: s.seoRobots ?? "index,follow",
    seoExcludeFromSitemap: s.seoExcludeFromSitemap ?? false,
  });

  if (s.status) await setPostStatus(db(), postId, s.status);

  revalidatePath(`/admin/posts/${postId}/edit`);
  revalidatePath("/admin/posts");
  redirect(`/admin/posts/${postId}/edit`);
}

export async function restorePageRevisionAction(
  pageId: number,
  revisionId: number,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);

  const revision = await getRevision(db(), revisionId);
  if (!revision) throw new Error("Revision not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = JSON.parse(revision.snapshot) as Record<string, any>;

  await updatePage(db(), pageId, {
    title: s.title,
    contentJson: s.contentJson,
    template: s.template || null,
    createdBy: s.authorId || undefined,
    publishedAt: s.postDate ? new Date(s.postDate).toISOString() : null,
    schemaTypes: Array.isArray(s.schemaTypes) ? s.schemaTypes : [],
  });

  await updatePageSeo(db(), pageId, {
    seoTitle: s.seoTitleDirty ? (s.seoTitleExplicit || null) : null,
    seoDescription: s.seoDescription || null,
    seoOgImage: s.seoOgImage || null,
    seoRobots: s.seoRobots ?? "index,follow",
    seoExcludeFromSitemap: s.seoExcludeFromSitemap ?? false,
  });

  if (s.status) await setPageStatus(db(), pageId, s.status);

  revalidatePath(`/admin/pages/${pageId}/edit`);
  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${pageId}/edit`);
}
