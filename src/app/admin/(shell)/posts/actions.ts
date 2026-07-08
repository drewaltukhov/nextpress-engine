"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getSetting } from "@core-plugins/settings/registry";
import { SCHEMA_CATALOG, SCHEMA_CATALOG_TYPES } from "@core-plugins/seo/schema-catalog";
import { createAutoRedirect } from "@core-plugins/redirects";
import { listTopics, type TopicListItem } from "@core-plugins/topics";
import { SYSTEM_ROLE_ORDER, SYSTEM_ROLE_SLUGS } from "../roles/entities";
import {
  listPosts,
  listTopicIdsForPosts,
  getPost,
  listAuthors,
  listPillars,
  createPost,
  updatePost,
  updatePostSeo,
  setPostStatus,
  setPostTopics,
  trashPost,
  restorePost,
  forceDeletePost,
  duplicatePost,
  countSpikesForPillar,
  getPostOwner,
  getPostTitle,
  PostSlugConflictError,
  PostSlugReservedError,
  PostNotFoundError,
  PostParentInvalidError,
  type PostListItem,
  type PostDetail,
  type AuthorSummary,
  type PillarOption,
  type ListPostsFilters,
  type PostStatus,
  type PostKind,
  type PostRobots,
} from "@core-plugins/posts";

export type SaveResult = { ok: true; id?: number } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Permission matrix (same shape as pages):
//   posts.new   → see/edit all, publish/unpublish, delete (admin/editor)
//   posts.draft → create + edit only OWN drafts; can't publish; can't delete
//   topics.assign → tag posts with existing topics (no topic creation)
// ---------------------------------------------------------------------------

interface PostsActor {
  userId: string;
  hasNew: boolean;
  hasDraft: boolean;
  /** True for `topics.assign` (granted to author/editor) or admin wildcard. */
  canAssignTopics: boolean;
  isAdmin: boolean;
  canEditPost: (ownerId: string | null | undefined) => boolean;
  canPublish: boolean;
  canDelete: boolean;
}

async function actorFromSession(): Promise<{ ok: true; actor: PostsActor } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const userId = await resolveUserId(db(), session.user);
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  const hasNew = hasPermission(perms, "posts.new");
  const hasDraft = hasPermission(perms, "posts.draft");
  const canAssignTopics = hasPermission(perms, "topics.assign") || perms.has("*");
  const isAdmin = perms.has("*");
  if (!hasNew && !hasDraft) {
    return { ok: false, error: "You don't have permission to manage posts" };
  }
  return {
    ok: true,
    actor: {
      userId,
      hasNew,
      hasDraft,
      canAssignTopics,
      isAdmin,
      canEditPost: (ownerId) => hasNew || (hasDraft && !!userId && ownerId === userId),
      canPublish: hasNew,
      canDelete: hasNew,
    },
  };
}

async function commonGuard(): Promise<{ ok: true; actor: PostsActor } | { ok: false; error: string }> {
  const got = await actorFromSession();
  if (!got.ok) return got;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  return got;
}

// ---------------------------------------------------------------------------
// Permissions snapshot — used by the page server-component to gate UI
// ---------------------------------------------------------------------------

export interface PostsPermissions {
  userId: string | null;
  canSeeAll: boolean;
  canPublish: boolean;
  canDelete: boolean;
  canAssignTopics: boolean;
  /** Strict admin (wildcard `*`) — gates author reassignment in the edit form. */
  isAdmin: boolean;
}

export async function getPostsPermissions(): Promise<PostsPermissions> {
  const got = await actorFromSession();
  if (!got.ok) {
    return {
      userId: null,
      canSeeAll: false,
      canPublish: false,
      canDelete: false,
      canAssignTopics: false,
      isAdmin: false,
    };
  }
  return {
    userId: got.actor.userId,
    canSeeAll: got.actor.hasNew,
    canPublish: got.actor.canPublish,
    canDelete: got.actor.canDelete,
    canAssignTopics: got.actor.canAssignTopics,
    isAdmin: got.actor.isAdmin,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface PostsListBundle {
  rows: PostListItem[];
  /** Per-post topic ids — keyed by post id, values are sorted ascending. */
  topicsByPost: Record<number, number[]>;
  /** All topics referenced anywhere in `rows` — for rendering pill labels. */
  topicCatalog: Record<number, { id: number; name: string; slug: string }>;
}

export async function getPostsList(filters: ListPostsFilters = {}): Promise<PostsListBundle> {
  const got = await actorFromSession();
  if (!got.ok) return { rows: [], topicsByPost: {}, topicCatalog: {} };

  const scoped: ListPostsFilters = got.actor.hasNew
    ? filters
    : { ...filters, scopeToOwnerId: got.actor.userId };
  const rows = await listPosts(db(), scoped);

  // Bulk-fetch topic ids in one round-trip and bundle the topic catalog
  // for the labels — the list view renders pills inline so it needs the
  // full topic name, not just an id. The catalog is restricted to topics
  // actually referenced by the visible rows so big topic taxonomies don't
  // bloat the response.
  const topicMap = await listTopicIdsForPosts(db(), rows.map((r) => r.id));
  const topicsByPost: Record<number, number[]> = {};
  const referenced = new Set<number>();
  for (const [postId, ids] of topicMap.entries()) {
    const sorted = [...ids].sort((a, b) => a - b);
    topicsByPost[postId] = sorted;
    for (const id of sorted) referenced.add(id);
  }

  const topicCatalog: Record<number, { id: number; name: string; slug: string }> = {};
  if (referenced.size > 0) {
    const placeholders = Array.from(referenced).map(() => "?").join(",");
    const r = await db().execute({
      sql: `SELECT id, name, slug FROM topics WHERE id IN (${placeholders})`,
      args: Array.from(referenced),
    });
    for (const row of r.rows) {
      const id = Number(row.id);
      topicCatalog[id] = { id, name: String(row.name), slug: String(row.slug) };
    }
  }

  return { rows, topicsByPost, topicCatalog };
}

export async function getPostsAuthors(): Promise<AuthorSummary[]> {
  const got = await actorFromSession();
  if (!got.ok || !got.actor.hasNew) return [];
  return listAuthors(db());
}

export async function getPillarOptions(): Promise<PillarOption[]> {
  const got = await actorFromSession();
  if (!got.ok) return [];
  return listPillars(db());
}

export async function getAssignableTopics(): Promise<TopicListItem[]> {
  const got = await actorFromSession();
  if (!got.ok || !got.actor.canAssignTopics) return [];
  return listTopics(db());
}

/**
 * Topics list for the posts list-view filter dropdown. Available to anyone
 * who can browse posts — narrowing the visible posts by topic doesn't
 * leak any data the actor wouldn't already see in the unfiltered list,
 * and it'd be confusing if Authors couldn't filter their own posts by
 * the topics they tagged.
 */
export async function getTopicFilterOptions(): Promise<TopicListItem[]> {
  const got = await actorFromSession();
  if (!got.ok) return [];
  return listTopics(db());
}

export type AuthorRoleKind = "admin" | "editor" | "author" | "custom" | "none";

export interface AuthorOption {
  id: string;
  displayName: string;
  email: string;
  roleSlugs: string[];
  roleKind: AuthorRoleKind;
}

function classifyRoles(slugs: string[]): AuthorRoleKind {
  if (slugs.length === 0) return "none";
  for (const sys of SYSTEM_ROLE_ORDER) {
    if (slugs.includes(sys)) return sys as AuthorRoleKind;
  }
  if (slugs.some((s) => !SYSTEM_ROLE_SLUGS.has(s))) return "custom";
  return "none";
}

export async function getAuthorOptions(): Promise<AuthorOption[]> {
  const got = await actorFromSession();
  if (!got.ok || !got.actor.isAdmin) return [];
  const res = await db().execute({
    sql: `SELECT u.id, u.display_name, u.email,
                 GROUP_CONCAT(ur.role_slug) AS role_csv
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
          WHERE u.tenant_id = 1
            AND u.deleted_at IS NULL
            AND u.status != 'disabled'
          GROUP BY u.id, u.display_name, u.email
          ORDER BY COALESCE(u.display_name, u.email) COLLATE NOCASE ASC`,
    args: [],
  });
  return res.rows.map((r) => {
    const csv = r.role_csv != null ? String(r.role_csv) : "";
    const roleSlugs = csv ? csv.split(",").filter(Boolean) : [];
    return {
      id: String(r.id),
      displayName: r.display_name != null ? String(r.display_name) : String(r.email),
      email: String(r.email),
      roleSlugs,
      roleKind: classifyRoles(roleSlugs),
    };
  });
}

export interface InstalledSchema {
  type: string;
  name: string;
  description: string;
  docsUrl: string;
}

export async function getInstalledSchemas(): Promise<InstalledSchema[]> {
  const enabled = await getSetting<string[]>(db(), "seo.enabled_schemas");
  if (!Array.isArray(enabled) || enabled.length === 0) return [];
  const enabledSet = new Set(enabled);
  return SCHEMA_CATALOG
    .filter((entry) => enabledSet.has(entry.type))
    .map((entry) => ({
      type: entry.type,
      name: entry.name,
      description: entry.description,
      docsUrl: entry.docsUrl,
    }));
}

export async function getPostDetail(id: number): Promise<PostDetail | null> {
  const got = await actorFromSession();
  if (!got.ok) return null;
  const post = await getPost(db(), id);
  if (!post) return null;
  if (!got.actor.canEditPost(post.createdBy)) return null;
  return post;
}

/**
 * Compute the JSON-LD nodes that the public route would emit for this
 * post. Powers the Schema Checkup tab in `SeoEditDialog`. Mirrors the
 * pages `getPageSchemaPreview` exactly — same canonical resolution
 * rules (spikes get the `/<pillar>/<slug>` shape), same suppression
 * checks, same `buildPostJsonLdNodes` call so the preview matches what
 * crawlers will see.
 */
export interface PostSchemaPreview {
  /** Each `object` is one schema.org node (Article, FAQPage, BreadcrumbList, …). */
  nodes: object[];
  /** Set when the result is empty for a non-content reason (`noindex` on
   *  the post or site-level `discourageIndexing`). */
  suppressionReason: "noindex" | "discourage_indexing" | null;
  /** The canonical URL the public render would use. Shown above the
   *  nodes so the admin can sanity-check the URL shape (especially
   *  important for spikes with /<pillar>/<slug> paths). */
  canonical: string;
}

export async function getPostSchemaPreview(id: number): Promise<PostSchemaPreview | null> {
  const got = await actorFromSession();
  if (!got.ok) return null;
  const post = await getPost(db(), id);
  if (!post) return null;
  if (!got.actor.canEditPost(post.createdBy)) return null;

  // Lazy import — `published-view` pulls in @measured/puck (large client
  // surface). Keeping the import inside the function means callers that
  // never touch this action don't ship the Puck blocks bundle.
  const { buildPostJsonLdNodes, parsePuckData } = await import(
    "@core-plugins/posts/published-view"
  );

  const [
    siteUrlSetting,
    siteTitle,
    defaultOgImage,
    discourageIndexing,
    breadcrumbEnabled,
    articleEnabled,
  ] = await Promise.all([
    getSetting<string>(db(), "site.url"),
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "seo.default_og_image"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
    getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    getSetting<boolean>(db(), "seo.schema_article_enabled"),
  ]);

  const siteUrl = siteUrlSetting ?? "";
  const trimmedSiteUrl = siteUrl.replace(/\/$/, "");

  // URL shape mirrors the public router:
  //   - pillar/standalone: /<slug>
  //   - spike:             /<parentSlug>/<slug>  (only when parent visible)
  // Falls back to a slug-only path when no site URL is configured — same
  // pattern the pages preview uses.
  let path: string;
  if (post.postKind === "spike" && post.parentSlug) {
    path = `/${post.parentSlug}/${post.slug}`;
  } else {
    path = `/${post.slug}`;
  }
  const canonical =
    post.seoCanonical?.trim() ||
    (trimmedSiteUrl ? `${trimmedSiteUrl}${path}` : path);

  const data = parsePuckData(post.contentJson);

  const nodes = buildPostJsonLdNodes({
    post,
    seo: {
      siteTitle: siteTitle ?? "",
      siteUrl,
      defaultOgImage: defaultOgImage ?? "",
      discourageIndexing: discourageIndexing ?? false,
    },
    canonical,
    data,
    breadcrumbEnabled: breadcrumbEnabled ?? true,
    articleEnabled: articleEnabled ?? true,
  });

  let suppressionReason: PostSchemaPreview["suppressionReason"] = null;
  if (nodes.length === 0) {
    if (discourageIndexing) suppressionReason = "discourage_indexing";
    else if (post.seoRobots.startsWith("noindex")) suppressionReason = "noindex";
  }

  return { nodes, suppressionReason, canonical };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreatePostActionInput {
  title: string;
  slug?: string;
  excerpt?: string;
  status?: PostStatus;
  postKind?: PostKind;
  parentId?: number | null;
  featuredImage?: string | null;
  schemaTypes?: string[];
  topicIds?: number[];
  /** Slug of a custom template, or "" / null for the built-in default
   *  for this kind. Stored verbatim; the renderer's resolveTemplateData
   *  falls back gracefully if the slug no longer exists. */
  template?: string | null;
}

export async function createPostAction(input: CreatePostActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const status: PostStatus =
    input.status === "published" && guard.actor.canPublish ? "published" : "draft";

  const schemaTypes = input.schemaTypes
    ? await filterToInstalledSchemas(input.schemaTypes)
    : [];

  // Topic assignment requires `topics.assign`. If the actor lacks it but
  // somehow sent ids (stale client / malformed POST), drop the list — the
  // post still gets created untagged rather than failing the whole save.
  const topicIds = input.topicIds && guard.actor.canAssignTopics ? input.topicIds : [];

  let id: number;
  try {
    id = await createPost(db(), {
      title: input.title,
      slug: input.slug?.trim() || undefined,
      excerpt: input.excerpt ?? null,
      status,
      postKind: input.postKind,
      parentId: input.parentId ?? null,
      featuredImage: input.featuredImage ?? null,
      schemaTypes,
      topicIds,
      template: input.template ?? null,
      createdBy: guard.actor.userId,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.created",
      targetType: "post",
      targetId: String(id),
      diff: {
        title: input.title.trim(),
        slug: input.slug?.trim() || undefined,
        status,
        postKind: input.postKind,
        parentId: input.parentId ?? null,
        schemaTypes,
        topicIds,
      },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  return { ok: true, id };
}

async function filterToInstalledSchemas(types: string[]): Promise<string[]> {
  const enabled = await getSetting<string[]>(db(), "seo.enabled_schemas");
  const enabledSet = new Set(Array.isArray(enabled) ? enabled : []);
  return types.filter((t) => SCHEMA_CATALOG_TYPES.has(t) && enabledSet.has(t));
}

export interface UpdatePostActionInput {
  title?: string;
  slug?: string;
  contentJson?: string | null;
  excerpt?: string | null;
  postKind?: PostKind;
  parentId?: number | null;
  featuredImage?: string | null;
  /** Reassign author. Admin-only. */
  createdBy?: string | null;
  publishedAt?: string | null;
  schemaTypes?: string[];
  /** Replace topic assignments. Requires topics.assign. */
  topicIds?: number[];
  template?: string | null;
}

export async function updatePostAction(id: number, input: UpdatePostActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };
  if (!guard.actor.canEditPost(owner)) {
    return { ok: false, error: "You can only edit posts you authored" };
  }

  if (input.createdBy !== undefined && !guard.actor.isAdmin) {
    return { ok: false, error: "Only administrators can reassign post authors" };
  }
  if (input.publishedAt !== undefined && !guard.actor.canPublish) {
    return { ok: false, error: "Only publishers can change the post date" };
  }
  if (input.topicIds !== undefined && !guard.actor.canAssignTopics) {
    return { ok: false, error: "You don't have permission to assign topics" };
  }

  if (input.publishedAt) {
    const parsed = new Date(input.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Invalid post date" };
    }
  }

  if (input.createdBy) {
    const r = await db().execute({
      sql: "SELECT 1 FROM users WHERE tenant_id = 1 AND id = ? LIMIT 1",
      args: [input.createdBy],
    });
    if (r.rows.length === 0) {
      return { ok: false, error: "Author not found" };
    }
  }

  const filteredSchemaTypes = input.schemaTypes !== undefined
    ? await filterToInstalledSchemas(input.schemaTypes)
    : undefined;

  // Capture pre-update URL shape so we can auto-create a redirect if the
  // slug or parent moves. Pillars also need every spike child snapshotted,
  // because changing a pillar's slug cascades to every `/pillar/spike` URL.
  const before = await getPost(db(), id);
  let pillarSpikesBefore: { id: number; slug: string }[] = [];
  if (before && before.postKind === "pillar") {
    const spikes = await listPosts(db(), { view: "live", kind: "spike", pillarId: id });
    pillarSpikesBefore = spikes.map((s) => ({ id: s.id, slug: s.slug }));
  }

  try {
    await updatePost(db(), id, {
      ...input,
      schemaTypes: filteredSchemaTypes,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Resolve canonical title for the audit-log diff so the activity
  // feed always shows it, even when the update didn't touch the
  // title field. Falls back to `input.title` when the helper read
  // fails (row vanished mid-flight).
  let canonicalTitle: string | null = input.title ?? null;
  try {
    const t = await getPostTitle(db(), id);
    if (t != null) canonicalTitle = t;
  } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.updated",
      targetType: "post",
      targetId: String(id),
      diff: {
        ...input,
        title: canonicalTitle ?? undefined,
        schemaTypes: filteredSchemaTypes,
        contentJson: input.contentJson != null ? "(json)" : undefined,
      },
    });
  } catch { /* audit non-fatal */ }

  // Auto-redirects on slug/permalink change. createAutoRedirect already
  // honors the per-source admin toggle and swallows its own errors, so
  // failures here never break the save path. Read fresh to get the
  // post-normalize slug + post-update parent join.
  try {
    const after = await getPost(db(), id);
    if (before && after) {
      const oldUrl = postPublicUrl(before);
      const newUrl = postPublicUrl(after);
      if (oldUrl !== newUrl) {
        await createAutoRedirect(db(), {
          fromPath: oldUrl,
          toPath: newUrl,
          source: before.slug !== after.slug ? "slug_change" : "permalink_change",
          createdBy: guard.actor.userId,
        });
      }
      // Pillar slug change cascades to every spike URL underneath.
      if (
        before.postKind === "pillar"
        && after.postKind === "pillar"
        && before.slug !== after.slug
      ) {
        for (const spike of pillarSpikesBefore) {
          await createAutoRedirect(db(), {
            fromPath: `/${before.slug}/${spike.slug}`,
            toPath: `/${after.slug}/${spike.slug}`,
            source: "slug_change",
            createdBy: guard.actor.userId,
          });
        }
      }
    }
  } catch { /* redirect creation non-fatal */ }

  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${id}/edit`);
  return { ok: true, id };
}

export interface UpdatePostSeoActionInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoOgImage?: string | null;
  seoCanonical?: string | null;
  seoRobots?: PostRobots;
  seoExcludeFromSitemap?: boolean;
}

export async function updatePostSeoAction(id: number, input: UpdatePostSeoActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };
  if (!guard.actor.canEditPost(owner)) {
    return { ok: false, error: "You can only edit posts you authored" };
  }

  try {
    await updatePostSeo(db(), id, input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Resolve the post's canonical title so the activity feed shows
  // which post got its SEO updated.
  let seoTitle: string | null = null;
  try { seoTitle = await getPostTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.seoUpdated",
      targetType: "post",
      targetId: String(id),
      diff: { ...input, title: seoTitle ?? undefined },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${id}/edit`);
  return { ok: true, id };
}

export async function setPostStatusAction(id: number, status: PostStatus): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canPublish) {
    return { ok: false, error: "Only publishers can change visibility" };
  }

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };

  try {
    await setPostStatus(db(), id, status);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  let title: string | null = null;
  try { title = await getPostTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: status === "published" ? "posts.published" : "posts.unpublished",
      targetType: "post",
      targetId: String(id),
      diff: title ? { title, status } : { status },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${id}/edit`);
  return { ok: true, id };
}

export async function setPostTopicsAction(id: number, topicIds: number[]): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canAssignTopics) {
    return { ok: false, error: "You don't have permission to assign topics" };
  }

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };
  if (!guard.actor.canEditPost(owner)) {
    return { ok: false, error: "You can only edit posts you authored" };
  }

  try {
    await setPostTopics(db(), id, topicIds);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath("/admin/posts");
  revalidatePath(`/admin/posts/${id}/edit`);
  return { ok: true, id };
}

export async function deletePostAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can delete posts" };
  }

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };

  // Capture title before trashing — the helper accepts trashed
  // rows but doing the read up-front keeps the audit-log payload
  // identical regardless of how the underlying delete evolves.
  let title: string | null = null;
  try { title = await getPostTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await trashPost(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.trashed",
      targetType: "post",
      targetId: String(id),
      diff: title ? { title } : undefined,
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  return { ok: true };
}

/**
 * Duplicate a post into a new draft. Permission model: anyone who can
 * edit the source can duplicate it (a duplicate is a brand-new draft;
 * authors will become the new row's owner).
 */
export async function duplicatePostAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPostOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Post not found" };
  if (!guard.actor.canEditPost(owner)) {
    return { ok: false, error: "You can only duplicate posts you authored" };
  }

  let newId: number;
  try {
    newId = await duplicatePost(db(), id, guard.actor.userId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.duplicated",
      targetType: "post",
      targetId: String(newId),
      diff: { sourceId: id },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  return { ok: true, id: newId };
}

export async function restorePostAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can restore posts" };
  }

  const post = await getPost(db(), id);
  if (!post) return { ok: false, error: "Post not found" };
  if (!post.trashedAt) return { ok: false, error: "Post is not in trash" };

  try {
    await restorePost(db(), id);
  } catch (err) {
    if (err instanceof PostSlugConflictError) {
      return {
        ok: false,
        error: `A live post with slug "${post.slug}" already exists. Rename it before restoring this one.`,
      };
    }
    if (err instanceof PostNotFoundError) {
      return { ok: false, error: "Post not found" };
    }
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.restored",
      targetType: "post",
      targetId: String(id),
      // `post` was loaded above for the trashed-state check.
      diff: { title: post.title },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  return { ok: true };
}

export async function forceDeletePostAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can permanently delete posts" };
  }

  const post = await getPost(db(), id);
  if (!post) return { ok: false, error: "Post not found" };
  if (!post.trashedAt) {
    return { ok: false, error: "Move the post to trash before permanently deleting it." };
  }

  try {
    await forceDeletePost(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "posts.purged",
      targetType: "post",
      targetId: String(id),
      // `post` was loaded above for the trashed-state check.
      diff: { title: post.title },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/posts");
  return { ok: true };
}

/**
 * Spike count for a pillar — used by the trash dialog to warn before
 * trashing a pillar whose spikes will be orphaned. Cheap COUNT(*) query.
 */
export async function getPillarSpikeCount(pillarId: number): Promise<number> {
  const got = await actorFromSession();
  if (!got.ok) return 0;
  return countSpikesForPillar(db(), pillarId);
}

function errorMessage(err: unknown): string {
  if (err instanceof PostSlugConflictError) return err.message;
  if (err instanceof PostSlugReservedError) return err.message;
  if (err instanceof PostNotFoundError) return err.message;
  if (err instanceof PostParentInvalidError) return err.message;
  return err instanceof Error ? err.message : "Save failed";
}

// Mirrors the public-route resolution in src/app/[slug] + [slug]/[childSlug]:
// spikes live under their pillar's slug, everything else is top-level.
function postPublicUrl(post: { slug: string; postKind: PostKind; parentSlug: string | null }): string {
  if (post.postKind === "spike" && post.parentSlug) {
    return `/${post.parentSlug}/${post.slug}`;
  }
  return `/${post.slug}`;
}
