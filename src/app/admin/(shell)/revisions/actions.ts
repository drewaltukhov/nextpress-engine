"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { saveRevision, getRevisions, getRevision, type RevisionRow } from "@core/revisions/service";
import { updatePost, updatePostSeo, setPostStatus, getPostOwner } from "@core-plugins/posts";
import { updatePage, updatePageSeo, setPageStatus, getPageOwner } from "@core-plugins/pages";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";

type SaveRevisionResult = { ok: true } | { ok: false; error: string };
type GetRevisionsResult =
  | { ok: true; revisions: RevisionRow[] }
  | { ok: false; error: string };
type GetRevisionResult =
  | { ok: true; revision: RevisionRow }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Revisions apply the editors' own rules (posts/actions.ts and
// pages/actions.ts actorFromSession): `<kind>s.new` edits everything and may
// publish, `<kind>s.draft` edits only its own items, only `topics.assign`
// changes a post's topics, and only admins change the author. Server actions are directly invokable, so every action here
// checks the target itself (security audit 2026-11-12).
// ---------------------------------------------------------------------------

interface RevisionActor {
  userId: string;
  canPublish: boolean;
  canAssignTopics: boolean;
  isAdmin: boolean;
}

async function actorFor(
  kind: "post" | "page",
  contentId: number,
): Promise<{ ok: true; actor: RevisionActor } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const userId = await resolveUserId(db(), session.user);
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  const hasNew = hasPermission(perms, `${kind}s.new`);
  const hasDraft = hasPermission(perms, `${kind}s.draft`);
  const owner = kind === "post" ? await getPostOwner(db(), contentId) : await getPageOwner(db(), contentId);
  if (owner === undefined) return { ok: false, error: "Not found" };
  if (!hasNew && !(hasDraft && !!userId && owner === userId)) {
    return { ok: false, error: `You can't edit this ${kind}` };
  }
  return {
    ok: true,
    actor: {
      userId,
      canPublish: hasNew,
      canAssignTopics: hasPermission(perms, "topics.assign") || perms.has("*"),
      isAdmin: perms.has("*"),
    },
  };
}

export async function saveRevisionAction(
  kind: "post" | "page",
  contentId: number,
  snapshot: unknown,
): Promise<SaveRevisionResult> {
  const got = await actorFor(kind, contentId);
  if (!got.ok) return got;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  try {
    await saveRevision(db(), kind, contentId, snapshot, got.actor.userId);
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
  const got = await actorFor(kind, contentId);
  if (!got.ok) return got;
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
  try {
    const revision = await getRevision(db(), revisionId);
    if (!revision) return { ok: false, error: "Revision not found" };
    const got = await actorFor(revision.kind, revision.contentId);
    if (!got.ok) return got;
    return { ok: true, revision };
  } catch (err) {
    console.error("getRevisionAction:", err);
    return { ok: false, error: "Failed to fetch revision" };
  }
}

export async function restoreBlockAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const kind = formData.get("kind") === "page" ? "page" : "post";
  const contentId = Number(formData.get("contentId"));
  const newContentJson = formData.get("newContentJson") as string;
  const got = await actorFor(kind, contentId);
  if (!got.ok) throw new Error(got.error);
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);
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
  const got = await actorFor("post", postId);
  if (!got.ok) throw new Error(got.error);
  const { actor } = got;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);

  const revision = await getRevision(db(), revisionId);
  if (!revision) throw new Error("Revision not found");
  if (revision.kind !== "post" || revision.contentId !== postId) {
    throw new Error("Revision does not belong to this post");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = JSON.parse(revision.snapshot) as Record<string, any>;

  await updatePost(db(), postId, {
    title: s.title,
    contentJson: s.contentJson,
    postKind: s.postKind,
    parentId: s.parentId ?? null,
    template: s.template || null,
    // Only admins re-author; only publishers change the publish date; only
    // topics.assign changes topics (same rules as updatePostAction).
    createdBy: actor.isAdmin ? s.authorId || undefined : undefined,
    publishedAt: actor.canPublish ? (s.postDate ? new Date(s.postDate).toISOString() : null) : undefined,
    featuredImage: s.featuredImage || null,
    excerpt: s.excerpt || null,
    schemaTypes: Array.isArray(s.schemaTypes) ? s.schemaTypes : [],
    topicIds: actor.canAssignTopics ? (Array.isArray(s.topicIds) ? s.topicIds : []) : undefined,
  });

  await updatePostSeo(db(), postId, {
    seoTitle: s.seoTitleDirty ? (s.seoTitleExplicit || null) : null,
    seoDescription: s.seoDescription || null,
    seoOgImage: s.seoOgImage || null,
    seoRobots: s.seoRobots ?? "index,follow",
    seoExcludeFromSitemap: s.seoExcludeFromSitemap ?? false,
  });

  if (s.status && actor.canPublish) await setPostStatus(db(), postId, s.status);

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
  const got = await actorFor("page", pageId);
  if (!got.ok) throw new Error(got.error);
  const { actor } = got;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) throw new Error(writeable.error);

  const revision = await getRevision(db(), revisionId);
  if (!revision) throw new Error("Revision not found");
  if (revision.kind !== "page" || revision.contentId !== pageId) {
    throw new Error("Revision does not belong to this page");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = JSON.parse(revision.snapshot) as Record<string, any>;

  await updatePage(db(), pageId, {
    title: s.title,
    contentJson: s.contentJson,
    template: s.template || null,
    // Only admins re-author; only publishers change the publish date
    // (same rules as updatePageAction).
    createdBy: actor.isAdmin ? s.authorId || undefined : undefined,
    publishedAt: actor.canPublish ? (s.postDate ? new Date(s.postDate).toISOString() : null) : undefined,
    schemaTypes: Array.isArray(s.schemaTypes) ? s.schemaTypes : [],
  });

  await updatePageSeo(db(), pageId, {
    seoTitle: s.seoTitleDirty ? (s.seoTitleExplicit || null) : null,
    seoDescription: s.seoDescription || null,
    seoOgImage: s.seoOgImage || null,
    seoRobots: s.seoRobots ?? "index,follow",
    seoExcludeFromSitemap: s.seoExcludeFromSitemap ?? false,
  });

  if (s.status && actor.canPublish) await setPageStatus(db(), pageId, s.status);

  revalidatePath(`/admin/pages/${pageId}/edit`);
  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${pageId}/edit`);
}
