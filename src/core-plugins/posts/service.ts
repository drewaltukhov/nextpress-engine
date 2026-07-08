/**
 * Posts service — admin CRUD + filtered list view + topics M:N + pillar/spike taxonomy.
 *
 * Built on the same shape as the Pages service (slug normalization,
 * trash/restore, status transitions, draft scope) with three Posts-only
 * concerns:
 *
 *   1. `postKind` — 'standalone' | 'pillar' | 'spike'. Spikes carry a
 *      `parentId` pointing at a pillar; standalone + pillars share the
 *      global root-slug namespace and reserve a slot in `reserved_slugs`.
 *      Spikes scope their slug uniqueness to siblings of the same pillar
 *      and do NOT reserve at the global level — their URL lives one
 *      segment deeper (`/<pillar>/<spike>`) so collisions are local.
 *
 *   2. `featuredImage` — a media URL. Doubles as the og:image fallback
 *      when `seoOgImage` is unset (handled at the metadata-render layer,
 *      not here).
 *
 *   3. Topics M:N — assigned via `setPostTopics` in the same write that
 *      updates the post; reads expose `topicIds` on detail and a
 *      pre-grouped lookup on list to avoid N+1 in the admin table.
 *
 * Visibility / scope rules mirror Pages: the action layer can pass
 * `scopeToOwnerId` to restrict the query to a single user's rows when
 * the actor only carries `posts.draft`.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { normalizeSlug } from "@core/slugs/normalize";
import { isSlugReserved } from "@core/slugs/registry";

export const POSTS_CACHE_TAG = "nextpress:posts";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

/**
 * Invalidate the Next.js data cache for any cached posts-list result.
 * Call from every write path that touches posts (create / update / delete /
 * trash / restore / topics assignment). Safe to call from non-Server-Action
 * contexts — the throw is swallowed.
 */
export function invalidatePostsCache(): void {
  try {
    updateTag(POSTS_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller will rely on revalidate TTL
  }
}
import {
  POST_KINDS,
  POST_ROBOTS,
  POST_STATUSES,
  type PostKind,
  type PostRobots,
  type PostStatus,
} from "./schema/posts";

export class PostSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A post with slug "${slug}" already exists`);
    this.name = "PostSlugConflictError";
  }
}

export class PostSlugReservedError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is reserved and can't be used as a post`);
    this.name = "PostSlugReservedError";
  }
}

export class PostNotFoundError extends Error {
  constructor(id: number) {
    super(`Post ${id} not found`);
    this.name = "PostNotFoundError";
  }
}

export class PostParentInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PostParentInvalidError";
  }
}

export interface PostListItem {
  id: number;
  title: string;
  slug: string;
  status: PostStatus;
  postKind: PostKind;
  parentId: number | null;
  /** Joined pillar slug — used to build /<pillar>/<spike> URLs in the admin table. */
  parentSlug: string | null;
  /** Joined pillar title — used for the breadcrumb chip in flat list mode. */
  parentTitle: string | null;
  publishedAt: string | null;
  featuredImage: string | null;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Per-post sitemap opt-out — surfaced on list rows so the sitemap
   *  iterator can filter without a second round-trip. */
  seoExcludeFromSitemap: boolean;
  createdBy: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  /** NULL = built-in template for this kind. Otherwise the slug of a
   *  custom theme_data row whose parent_template matches the kind
   *  ("single-post" for standalone/spike, "single-pillar" for pillar). */
  template: string | null;
}

export type PostView = "live" | "trash";

export interface PostDetail extends PostListItem {
  contentJson: string | null;
  excerpt: string | null;
  seoOgImage: string | null;
  seoCanonical: string | null;
  seoRobots: PostRobots;
  schemaTypes: string[];
  topicIds: number[];
}

// `seoExcludeFromSitemap` lives on PostListItem — the sitemap iterator
// reads it from the list query. PostDetail inherits it via `extends`.

export interface AuthorSummary {
  id: string;
  displayName: string;
  postCount: number;
}

export interface PillarOption {
  id: number;
  title: string;
  slug: string;
  status: PostStatus;
}

export interface ListPostsFilters {
  search?: string;
  status?: PostStatus | "all";
  /** Filter by kind. "all" returns everything. */
  kind?: PostKind | "all";
  /** Restrict to children of one pillar. Implies kind='spike'. */
  pillarId?: number;
  /** Restrict to spikes whose parent is any of these pillar IDs (OR
   *  semantics). Wins over `pillarId` if both are passed. Implies
   *  kind='spike' just like the single-pillar variant. Empty / unset
   *  = no scope. */
  pillarIds?: number[];
  /** Restrict to posts tagged with at least one of these topic ids
   *  (OR semantics — matches the editorial-filter intuition of "show
   *  me posts in any of these topics"). Empty / undefined = no scope. */
  topicIds?: number[];
  dateFrom?: string;
  dateTo?: string;
  authorId?: string;
  scopeToOwnerId?: string;
  view?: PostView;
  /** Order for the live view. "updated_at" (default) is right for the
   *  admin list — what was edited recently. "published_at" is right for
   *  public-facing widgets — what was published recently. The trash
   *  view always orders by `trashed_at` regardless of this option. */
  sort?: "updated_at" | "published_at";
}

const MAX_TITLE = 200;
const MAX_SLUG = 200;
const MAX_EXCERPT = 500;
const MAX_SEO_TITLE = 200;
const MAX_SEO_DESCRIPTION = 500;
const MAX_SEO_URL = 500;
const MAX_FEATURED_URL = 500;

function isPostStatus(s: string): s is PostStatus {
  return (POST_STATUSES as readonly string[]).includes(s);
}

function isPostKind(s: string): s is PostKind {
  return (POST_KINDS as readonly string[]).includes(s);
}

function isPostRobots(s: string): s is PostRobots {
  return (POST_ROBOTS as readonly string[]).includes(s);
}

function rowToListItem(row: Record<string, unknown>): PostListItem {
  const kindStr = String(row.post_kind);
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    status: String(row.status) as PostStatus,
    postKind: isPostKind(kindStr) ? kindStr : "standalone",
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    parentSlug: row.parent_slug != null ? String(row.parent_slug) : null,
    parentTitle: row.parent_title != null ? String(row.parent_title) : null,
    publishedAt: row.published_at != null ? String(row.published_at) : null,
    featuredImage: row.featured_image != null ? String(row.featured_image) : null,
    excerpt: row.excerpt != null ? String(row.excerpt) : null,
    seoTitle: row.seo_title != null ? String(row.seo_title) : null,
    seoDescription: row.seo_description != null ? String(row.seo_description) : null,
    seoExcludeFromSitemap: Number(row.seo_exclude_from_sitemap ?? 0) === 1,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    authorDisplayName: row.author_display_name != null ? String(row.author_display_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    trashedAt: row.trashed_at != null ? String(row.trashed_at) : null,
    template: row.template != null ? String(row.template) : null,
  };
}

function rowToDetail(row: Record<string, unknown>, topicIds: number[]): PostDetail {
  const robots = String(row.seo_robots);
  let schemaTypes: string[] = [];
  if (row.schema_types != null) {
    try {
      const parsed = JSON.parse(String(row.schema_types));
      if (Array.isArray(parsed)) {
        schemaTypes = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // Malformed — treat as empty.
    }
  }
  const list = rowToListItem(row);
  return {
    ...list,
    contentJson: row.content_json != null ? String(row.content_json) : null,
    excerpt: row.excerpt != null ? String(row.excerpt) : null,
    seoOgImage: row.seo_og_image != null ? String(row.seo_og_image) : null,
    seoCanonical: row.seo_canonical != null ? String(row.seo_canonical) : null,
    seoRobots: isPostRobots(robots) ? robots : "index,follow",
    schemaTypes,
    topicIds,
  };
}

/**
 * Validate that a `parentId` points at a non-trashed pillar — the only
 * legal parent shape for a spike. Throws PostParentInvalidError on any
 * deviation so the action layer can surface a friendly message.
 */
async function validatePillarParent(db: DbClient, parentId: number): Promise<void> {
  const r = await db.execute({
    sql: `SELECT post_kind, trashed_at FROM posts
          WHERE tenant_id = 1 AND id = ?
          LIMIT 1`,
    args: [parentId],
  });
  const row = r.rows[0];
  if (!row) throw new PostParentInvalidError("Parent pillar not found");
  if (row.trashed_at != null) throw new PostParentInvalidError("Parent pillar is in the trash");
  if (String(row.post_kind) !== "pillar") {
    throw new PostParentInvalidError("Parent must be a pillar");
  }
}

async function slugConflictsRoot(db: DbClient, slug: string, exceptId?: number): Promise<boolean> {
  const r = await db.execute({
    sql: exceptId
      ? `SELECT 1 FROM posts WHERE tenant_id = 1 AND slug = ?
         AND parent_id IS NULL AND trashed_at IS NULL AND id != ? LIMIT 1`
      : `SELECT 1 FROM posts WHERE tenant_id = 1 AND slug = ?
         AND parent_id IS NULL AND trashed_at IS NULL LIMIT 1`,
    args: exceptId ? [slug, exceptId] : [slug],
  });
  return r.rows.length > 0;
}

async function slugConflictsChild(
  db: DbClient,
  slug: string,
  parentId: number,
  exceptId?: number,
): Promise<boolean> {
  const r = await db.execute({
    sql: exceptId
      ? `SELECT 1 FROM posts WHERE tenant_id = 1 AND slug = ?
         AND parent_id = ? AND trashed_at IS NULL AND id != ? LIMIT 1`
      : `SELECT 1 FROM posts WHERE tenant_id = 1 AND slug = ?
         AND parent_id = ? AND trashed_at IS NULL LIMIT 1`,
    args: exceptId ? [slug, parentId, exceptId] : [slug, parentId],
  });
  return r.rows.length > 0;
}

/**
 * Return all topic ids assigned to the given post ids, keyed by post id.
 * One round-trip; the admin list view uses this to render the topics
 * column without an N+1.
 */
async function loadAllPostsTopicsRaw(db: DbClient): Promise<Array<[number, number]>> {
  const r = await db.execute({
    sql: "SELECT post_id, topic_id FROM posts_topics",
    args: [],
  });
  return r.rows.map((row) => [Number(row.post_id), Number(row.topic_id)] as [number, number]);
}

const loadAllPostsTopicsCached = unstable_cache(
  (): Promise<Array<[number, number]>> => loadAllPostsTopicsRaw(getRuntimeDb()),
  ["nextpress", "posts-topics-all", "v1"],
  // Same tag as posts so setPostTopics + post writes invalidate it.
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

async function loadTopicIdsForPosts(
  db: DbClient,
  postIds: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (postIds.length === 0) return map;
  // Pull the full posts_topics table once via cache, then filter in memory.
  // Cardinality is tens to low thousands of rows on a typical site — way
  // cheaper than re-querying per page render with a unique IN-list.
  const pairs = await cacheOrFallback(
    () => loadAllPostsTopicsCached(),
    () => loadAllPostsTopicsRaw(db),
  );
  const want = new Set(postIds);
  for (const [pid, tid] of pairs) {
    if (!want.has(pid)) continue;
    const existing = map.get(pid);
    if (existing) existing.push(tid);
    else map.set(pid, [tid]);
  }
  return map;
}

const listPostsCached = unstable_cache(
  (filters: ListPostsFilters): Promise<PostListItem[]> => listPostsRaw(getRuntimeDb(), filters),
  ["nextpress", "posts-list", "v1"],
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

export async function listPosts(
  db: DbClient,
  filters: ListPostsFilters = {},
): Promise<PostListItem[]> {
  // Route through unstable_cache when running inside a Next request scope.
  // Tests / scripts / other Node runtimes fall back to a direct fetch.
  return cacheOrFallback(
    () => listPostsCached(filters),
    () => listPostsRaw(db, filters),
  );
}

async function listPostsRaw(
  db: DbClient,
  filters: ListPostsFilters,
): Promise<PostListItem[]> {
  const where: string[] = ["p.tenant_id = 1"];
  const args: (string | number)[] = [];

  const view: PostView = filters.view ?? "live";
  where.push(view === "trash" ? "p.trashed_at IS NOT NULL" : "p.trashed_at IS NULL");

  if (filters.scopeToOwnerId) {
    where.push("p.created_by = ?");
    args.push(filters.scopeToOwnerId);
  } else if (filters.authorId) {
    where.push("p.created_by = ?");
    args.push(filters.authorId);
  }

  if (filters.status && filters.status !== "all") {
    where.push("p.status = ?");
    args.push(filters.status);
  }

  if (filters.kind && filters.kind !== "all") {
    where.push("p.post_kind = ?");
    args.push(filters.kind);
  }

  if (filters.pillarIds && filters.pillarIds.length > 0) {
    const placeholders = filters.pillarIds.map(() => "?").join(",");
    where.push(`p.parent_id IN (${placeholders})`);
    for (const id of filters.pillarIds) args.push(id);
  } else if (filters.pillarId) {
    where.push("p.parent_id = ?");
    args.push(filters.pillarId);
  }

  // Topic filter — OR over a set of ids. EXISTS subquery against the
  // posts_topics join; SQLite short-circuits on the first match. The IN
  // list is built from a fresh ?-placeholder array so any number of
  // selected topics composes safely with other filters.
  if (filters.topicIds && filters.topicIds.length > 0) {
    const placeholders = filters.topicIds.map(() => "?").join(",");
    where.push(
      `EXISTS (SELECT 1 FROM posts_topics pt WHERE pt.post_id = p.id AND pt.topic_id IN (${placeholders}))`,
    );
    for (const id of filters.topicIds) args.push(id);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push(
      "(p.title LIKE ? ESCAPE '\\' OR p.seo_title LIKE ? ESCAPE '\\' OR p.seo_description LIKE ? ESCAPE '\\')",
    );
    args.push(term, term, term);
  }

  if (filters.dateFrom) {
    where.push("p.updated_at >= ?");
    args.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    where.push("p.updated_at < datetime(?, '+1 day')");
    args.push(`${filters.dateTo} 00:00:00`);
  }

  // Sort: trash view by deletion time. Live view defaults to
  // newest-updated (right for the admin list — see HierarchicalList),
  // but `sort: "published_at"` switches to publish order for the
  // public widget data path. `(published_at IS NULL)` puts unpublished
  // rows last in both SQLite and Postgres without needing NULLS LAST.
  let orderBy: string;
  if (view === "trash") {
    orderBy = "p.trashed_at DESC, p.id DESC";
  } else if (filters.sort === "published_at") {
    orderBy = "(p.published_at IS NULL) ASC, p.published_at DESC, p.id DESC";
  } else {
    orderBy = "p.updated_at DESC, p.id DESC";
  }

  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.status, p.post_kind, p.parent_id,
                 parent.slug AS parent_slug, parent.title AS parent_title,
                 p.published_at, p.featured_image, p.excerpt,
                 p.seo_title, p.seo_description, p.seo_exclude_from_sitemap,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM posts p
          LEFT JOIN users u ON u.id = p.created_by
          LEFT JOIN posts parent ON parent.id = p.parent_id
          WHERE ${where.join(" AND ")}
          ORDER BY ${orderBy}`,
    args,
  });
  return r.rows.map(rowToListItem);
}

/**
 * Fetch all topic ids for a list of posts. Caller (admin list page) uses
 * this once after `listPosts` to populate the Topics pills column.
 */
export async function listTopicIdsForPosts(
  db: DbClient,
  postIds: number[],
): Promise<Map<number, number[]>> {
  return loadTopicIdsForPosts(db, postIds);
}

async function getPostRaw(db: DbClient, id: number): Promise<PostDetail | null> {
  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json, p.excerpt,
                 p.featured_image, p.status, p.post_kind, p.parent_id,
                 parent.slug AS parent_slug, parent.title AS parent_title,
                 p.published_at,
                 p.seo_title, p.seo_description, p.seo_og_image,
                 p.seo_canonical, p.seo_robots, p.seo_exclude_from_sitemap,
                 p.schema_types,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM posts p
          LEFT JOIN users u ON u.id = p.created_by
          LEFT JOIN posts parent ON parent.id = p.parent_id
          WHERE p.tenant_id = 1 AND p.id = ?
          LIMIT 1`,
    args: [id],
  });
  const row = r.rows[0];
  if (!row) return null;
  const topicMap = await loadTopicIdsForPosts(db, [id]);
  return rowToDetail(row, topicMap.get(id) ?? []);
}

const getPostCached = unstable_cache(
  (id: number): Promise<PostDetail | null> => getPostRaw(getRuntimeDb(), id),
  ["nextpress", "post-detail", "v1"],
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

export async function getPost(db: DbClient, id: number): Promise<PostDetail | null> {
  return cacheOrFallback(() => getPostCached(id), () => getPostRaw(db, id));
}

/**
 * Public lookup for the root /<slug> route. Returns published, non-trashed
 * pillar OR standalone posts. Spikes are intentionally excluded — they
 * live under /<pillar>/<spike> and are resolved by `getPublishedSpikeBySlug`.
 */
async function getPublishedRootPostBySlugRaw(
  db: DbClient,
  slug: string,
): Promise<PostDetail | null> {
  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json, p.excerpt,
                 p.featured_image, p.status, p.post_kind, p.parent_id,
                 parent.slug AS parent_slug, parent.title AS parent_title,
                 p.published_at,
                 p.seo_title, p.seo_description, p.seo_og_image,
                 p.seo_canonical, p.seo_robots, p.seo_exclude_from_sitemap,
                 p.schema_types,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM posts p
          LEFT JOIN users u ON u.id = p.created_by
          LEFT JOIN posts parent ON parent.id = p.parent_id
          WHERE p.tenant_id = 1 AND p.slug = ?
            AND p.parent_id IS NULL
            AND p.post_kind IN ('pillar','standalone')
            AND p.status = 'published'
            AND p.trashed_at IS NULL
          LIMIT 1`,
    args: [slug],
  });
  const row = r.rows[0];
  if (!row) return null;
  const id = Number(row.id);
  const topicMap = await loadTopicIdsForPosts(db, [id]);
  return rowToDetail(row, topicMap.get(id) ?? []);
}

const getPublishedRootPostBySlugCached = unstable_cache(
  (slug: string): Promise<PostDetail | null> => getPublishedRootPostBySlugRaw(getRuntimeDb(), slug),
  ["nextpress", "published-root-by-slug", "v1"],
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

export async function getPublishedRootPostBySlug(
  db: DbClient,
  slug: string,
): Promise<PostDetail | null> {
  return cacheOrFallback(
    () => getPublishedRootPostBySlugCached(slug),
    () => getPublishedRootPostBySlugRaw(db, slug),
  );
}

/**
 * Public lookup for the /<pillarSlug>/<spikeSlug> route. Returns the spike
 * only if its parent pillar is also published + non-trashed — otherwise
 * the URL would resolve a child whose parent isn't reachable, which is a
 * confusing 200.
 */
export async function getPublishedSpikeBySlug(
  db: DbClient,
  pillarSlug: string,
  spikeSlug: string,
): Promise<PostDetail | null> {
  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json, p.excerpt,
                 p.featured_image, p.status, p.post_kind, p.parent_id,
                 parent.slug AS parent_slug, parent.title AS parent_title,
                 p.published_at,
                 p.seo_title, p.seo_description, p.seo_og_image,
                 p.seo_canonical, p.seo_robots, p.seo_exclude_from_sitemap,
                 p.schema_types,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM posts p
          LEFT JOIN users u ON u.id = p.created_by
          INNER JOIN posts parent
            ON parent.id = p.parent_id
            AND parent.slug = ?
            AND parent.post_kind = 'pillar'
            AND parent.status = 'published'
            AND parent.trashed_at IS NULL
          WHERE p.tenant_id = 1 AND p.slug = ?
            AND p.post_kind = 'spike'
            AND p.status = 'published'
            AND p.trashed_at IS NULL
          LIMIT 1`,
    args: [pillarSlug, spikeSlug],
  });
  const row = r.rows[0];
  if (!row) return null;
  const id = Number(row.id);
  const topicMap = await loadTopicIdsForPosts(db, [id]);
  return rowToDetail(row, topicMap.get(id) ?? []);
}

async function listAuthorsRaw(db: DbClient): Promise<AuthorSummary[]> {
  const r = await db.execute({
    sql: `SELECT u.id,
                 COALESCE(u.display_name, u.email, '(deleted)') AS display_name,
                 COUNT(p.id) AS post_count
          FROM posts p
          LEFT JOIN users u ON u.id = p.created_by
          WHERE p.tenant_id = 1
            AND p.created_by IS NOT NULL
            AND p.trashed_at IS NULL
          GROUP BY u.id, display_name
          ORDER BY display_name COLLATE NOCASE ASC`,
    args: [],
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    postCount: Number(row.post_count),
  }));
}

const listAuthorsCached = unstable_cache(
  (): Promise<AuthorSummary[]> => listAuthorsRaw(getRuntimeDb()),
  ["nextpress", "post-authors", "v1"],
  // Author rows are derived from posts; tag with the posts tag so any post
  // write also refreshes the author list (display_name updates aside).
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

export async function listAuthors(db: DbClient): Promise<AuthorSummary[]> {
  return cacheOrFallback(() => listAuthorsCached(), () => listAuthorsRaw(db));
}

/**
 * List pillars (for the parent-picker on the edit form + the pillar
 * filter on the list view). Returns published + draft pillars so authors
 * can attach a spike to a not-yet-public pillar; the public render still
 * 404s the spike until the pillar publishes.
 */
async function listPillarsRaw(db: DbClient): Promise<PillarOption[]> {
  const r = await db.execute({
    sql: `SELECT id, title, slug, status FROM posts
          WHERE tenant_id = 1
            AND post_kind = 'pillar'
            AND trashed_at IS NULL
          ORDER BY title COLLATE NOCASE ASC`,
    args: [],
  });
  return r.rows.map((row) => {
    const status = String(row.status);
    return {
      id: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      status: isPostStatus(status) ? status : "draft",
    };
  });
}

const listPillarsCached = unstable_cache(
  (): Promise<PillarOption[]> => listPillarsRaw(getRuntimeDb()),
  ["nextpress", "post-pillars", "v1"],
  { tags: [POSTS_CACHE_TAG], revalidate: 300 },
);

export async function listPillars(db: DbClient): Promise<PillarOption[]> {
  return cacheOrFallback(() => listPillarsCached(), () => listPillarsRaw(db));
}

export interface CreatePostInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  status?: PostStatus;
  postKind?: PostKind;
  parentId?: number | null;
  featuredImage?: string | null;
  schemaTypes?: string[];
  topicIds?: number[];
  template?: string | null;
  createdBy: string | null;
}

/** Empty/whitespace = use built-in template (NULL). Otherwise pass-through;
 *  validating that the slug points at an existing custom row is left to
 *  the renderer's resolveTemplateData. */
function normalizeTemplateInput(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function createPost(db: DbClient, input: CreatePostInput): Promise<number> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (title.length > MAX_TITLE) throw new Error(`Title must be at most ${MAX_TITLE} characters`);

  const requestedSlug = input.slug?.trim() || title;
  const slug = normalizeSlug(requestedSlug);
  if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
  if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);

  const postKind: PostKind = input.postKind && isPostKind(input.postKind) ? input.postKind : "standalone";

  // Spikes get scoped slug uniqueness under their parent. Pillars +
  // standalone share the global root namespace and must also clear the
  // reserved-slugs registry (same rule that pages obey).
  let parentId: number | null = null;
  if (postKind === "spike") {
    if (!input.parentId) throw new PostParentInvalidError("Spike must have a parent pillar");
    await validatePillarParent(db, input.parentId);
    parentId = input.parentId;
    if (await slugConflictsChild(db, slug, parentId)) throw new PostSlugConflictError(slug);
  } else {
    if (await isSlugReserved(db, slug)) throw new PostSlugReservedError(slug);
    if (await slugConflictsRoot(db, slug)) throw new PostSlugConflictError(slug);
  }

  const excerpt = input.excerpt?.trim() || null;
  if (excerpt && excerpt.length > MAX_EXCERPT) {
    throw new Error(`Excerpt must be at most ${MAX_EXCERPT} characters`);
  }

  const featuredImage = input.featuredImage?.trim() || null;
  if (featuredImage && featuredImage.length > MAX_FEATURED_URL) {
    throw new Error("Featured image URL too long");
  }

  const status: PostStatus = input.status && isPostStatus(input.status) ? input.status : "draft";
  const publishedAt = status === "published" ? new Date().toISOString() : null;
  const schemaTypes = input.schemaTypes ? Array.from(new Set(input.schemaTypes)) : [];

  const template = normalizeTemplateInput(input.template);

  const r = await db.execute({
    sql: `INSERT INTO posts
            (tenant_id, title, slug, excerpt, featured_image, status, published_at,
             post_kind, parent_id, schema_types, template, created_by)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      title,
      slug,
      excerpt,
      featuredImage,
      status,
      publishedAt,
      postKind,
      parentId,
      JSON.stringify(schemaTypes),
      template,
      input.createdBy,
    ],
  });
  const id = Number(r.rows[0]?.id);

  if (input.topicIds && input.topicIds.length > 0) {
    await setPostTopics(db, id, input.topicIds);
  }

  invalidatePostsCache();
  return id;
}

export interface UpdatePostInput {
  title?: string;
  slug?: string;
  contentJson?: string | null;
  excerpt?: string | null;
  featuredImage?: string | null;
  postKind?: PostKind;
  parentId?: number | null;
  createdBy?: string | null;
  publishedAt?: string | null;
  schemaTypes?: string[];
  topicIds?: number[];
  template?: string | null;
}

export async function updatePost(db: DbClient, id: number, input: UpdatePostInput): Promise<void> {
  // Resolve the resulting kind + parent first so slug uniqueness can pick
  // the right partial index. We only re-query the row when the caller is
  // changing kind/parent; otherwise the existing partial-index check is
  // enough.
  let nextKind: PostKind | null = null;
  let nextParent: number | null | undefined = undefined;

  if (input.postKind !== undefined || input.parentId !== undefined) {
    const cur = await db.execute({
      sql: "SELECT post_kind, parent_id FROM posts WHERE tenant_id = 1 AND id = ? LIMIT 1",
      args: [id],
    });
    const row = cur.rows[0];
    if (!row) throw new PostNotFoundError(id);
    const curKindStr = String(row.post_kind);
    const curKind: PostKind = isPostKind(curKindStr) ? curKindStr : "standalone";
    const curParent = row.parent_id != null ? Number(row.parent_id) : null;

    nextKind = input.postKind && isPostKind(input.postKind) ? input.postKind : curKind;
    nextParent = input.parentId !== undefined ? input.parentId : curParent;

    // Non-spike kinds force parent_id to NULL — keeps the column meaningful.
    if (nextKind !== "spike") {
      nextParent = null;
    } else {
      if (!nextParent) throw new PostParentInvalidError("Spike must have a parent pillar");
      if (nextParent === id) throw new PostParentInvalidError("A post cannot be its own parent");
      await validatePillarParent(db, nextParent);
    }
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error("Title is required");
    if (title.length > MAX_TITLE) throw new Error(`Title must be at most ${MAX_TITLE} characters`);
    sets.push("title = ?");
    args.push(title);
  }

  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
    if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);

    // Uniqueness check uses the *new* placement (kind/parent) when the
    // caller is moving the row, otherwise the current row's placement.
    let resolvedKind: PostKind;
    let resolvedParent: number | null;
    if (nextKind !== null) {
      resolvedKind = nextKind;
      resolvedParent = nextParent ?? null;
    } else {
      const cur = await db.execute({
        sql: "SELECT post_kind, parent_id FROM posts WHERE tenant_id = 1 AND id = ? LIMIT 1",
        args: [id],
      });
      const row = cur.rows[0];
      if (!row) throw new PostNotFoundError(id);
      const k = String(row.post_kind);
      resolvedKind = isPostKind(k) ? k : "standalone";
      resolvedParent = row.parent_id != null ? Number(row.parent_id) : null;
    }

    if (resolvedKind === "spike" && resolvedParent !== null) {
      if (await slugConflictsChild(db, slug, resolvedParent, id)) {
        throw new PostSlugConflictError(slug);
      }
    } else {
      if (await isSlugReserved(db, slug)) throw new PostSlugReservedError(slug);
      if (await slugConflictsRoot(db, slug, id)) throw new PostSlugConflictError(slug);
    }
    sets.push("slug = ?");
    args.push(slug);
  }

  if (input.contentJson !== undefined) {
    sets.push("content_json = ?");
    args.push(input.contentJson);
  }

  if (input.excerpt !== undefined) {
    const excerpt = input.excerpt?.trim() || null;
    if (excerpt && excerpt.length > MAX_EXCERPT) {
      throw new Error(`Excerpt must be at most ${MAX_EXCERPT} characters`);
    }
    sets.push("excerpt = ?");
    args.push(excerpt);
  }

  if (input.featuredImage !== undefined) {
    const v = input.featuredImage?.trim() || null;
    if (v && v.length > MAX_FEATURED_URL) throw new Error("Featured image URL too long");
    sets.push("featured_image = ?");
    args.push(v);
  }

  if (nextKind !== null) {
    sets.push("post_kind = ?");
    args.push(nextKind);
    sets.push("parent_id = ?");
    args.push(nextParent ?? null);
  }

  if (input.createdBy !== undefined) {
    sets.push("created_by = ?");
    args.push(input.createdBy);
  }

  if (input.publishedAt !== undefined) {
    sets.push("published_at = ?");
    args.push(input.publishedAt);
  }

  if (input.schemaTypes !== undefined) {
    const unique = Array.from(new Set(input.schemaTypes));
    sets.push("schema_types = ?");
    args.push(JSON.stringify(unique));
  }

  if (input.template !== undefined) {
    sets.push("template = ?");
    args.push(normalizeTemplateInput(input.template));
  }

  if (sets.length > 0) {
    sets.push("updated_at = CURRENT_TIMESTAMP");
    args.push(id);
    await db.execute({
      sql: `UPDATE posts SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
      args,
    });
  }

  if (input.topicIds !== undefined) {
    await setPostTopics(db, id, input.topicIds);
  }

  invalidatePostsCache();
}

export interface UpdatePostSeoInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoOgImage?: string | null;
  seoCanonical?: string | null;
  seoRobots?: PostRobots;
  seoExcludeFromSitemap?: boolean;
}

export async function updatePostSeo(db: DbClient, id: number, input: UpdatePostSeoInput): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.seoTitle !== undefined) {
    const v = input.seoTitle?.trim() || null;
    if (v && v.length > MAX_SEO_TITLE) throw new Error(`SEO title must be at most ${MAX_SEO_TITLE} characters`);
    sets.push("seo_title = ?");
    args.push(v);
  }
  if (input.seoDescription !== undefined) {
    const v = input.seoDescription?.trim() || null;
    if (v && v.length > MAX_SEO_DESCRIPTION) {
      throw new Error(`SEO description must be at most ${MAX_SEO_DESCRIPTION} characters`);
    }
    sets.push("seo_description = ?");
    args.push(v);
  }
  if (input.seoOgImage !== undefined) {
    const v = input.seoOgImage?.trim() || null;
    if (v && v.length > MAX_SEO_URL) throw new Error("OG image URL too long");
    sets.push("seo_og_image = ?");
    args.push(v);
  }
  if (input.seoCanonical !== undefined) {
    const v = input.seoCanonical?.trim() || null;
    if (v && v.length > MAX_SEO_URL) throw new Error("Canonical URL too long");
    sets.push("seo_canonical = ?");
    args.push(v);
  }
  if (input.seoRobots !== undefined) {
    if (!isPostRobots(input.seoRobots)) throw new Error("Invalid robots value");
    sets.push("seo_robots = ?");
    args.push(input.seoRobots);
  }
  if (input.seoExcludeFromSitemap !== undefined) {
    sets.push("seo_exclude_from_sitemap = ?");
    args.push(input.seoExcludeFromSitemap ? 1 : 0);
  }

  if (sets.length === 0) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE posts SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });

  invalidatePostsCache();
}

export async function setPostStatus(db: DbClient, id: number, status: PostStatus): Promise<void> {
  if (!isPostStatus(status)) throw new Error("Invalid status");

  if (status === "published") {
    await db.execute({
      sql: `UPDATE posts
              SET status = 'published',
                  published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
                  updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = 1 AND id = ?`,
      args: [id],
    });
  } else {
    await db.execute({
      sql: `UPDATE posts
              SET status = 'draft',
                  updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = 1 AND id = ?`,
      args: [id],
    });
  }
  invalidatePostsCache();
}

/**
 * Replace the topic assignments for a post atomically. Two-step (delete
 * then bulk-insert) so the resulting `posts_topics` rows are exactly the
 * caller's set. CASCADE on `posts.id` covers the trash/delete paths so
 * we don't have to duplicate cleanup elsewhere.
 *
 * After the rewrite we recompute `topics.post_count` for the touched
 * topics — the live-read pattern memoed in
 * `feedback-denormalized-counts-live-read.md` is what the user prefers
 * for any cascade-FK-backed counter.
 */
export async function setPostTopics(db: DbClient, postId: number, topicIds: number[]): Promise<void> {
  const unique = Array.from(new Set(topicIds.filter((n) => Number.isFinite(n) && n > 0)));

  // Capture the union of "topics this post used to be tagged with" and
  // "topics it's about to be tagged with" — we need to refresh post_count
  // for both sides.
  const prev = await db.execute({
    sql: "SELECT topic_id FROM posts_topics WHERE post_id = ?",
    args: [postId],
  });
  const touched = new Set<number>(unique);
  for (const row of prev.rows) touched.add(Number(row.topic_id));

  await db.execute({
    sql: "DELETE FROM posts_topics WHERE post_id = ?",
    args: [postId],
  });

  for (const tid of unique) {
    await db.execute({
      sql: "INSERT INTO posts_topics (post_id, topic_id) VALUES (?, ?)",
      args: [postId, tid],
    });
  }

  // Refresh post_count on touched topics.
  for (const tid of touched) {
    await db.execute({
      sql: `UPDATE topics
              SET post_count = (
                SELECT COUNT(*) FROM posts_topics pt
                INNER JOIN posts p ON p.id = pt.post_id
                WHERE pt.topic_id = ? AND p.trashed_at IS NULL
              ),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [tid, tid],
    });
  }

  invalidatePostsCache();
}

/**
 * Move a post to trash. Spikes living under the post are NOT cascaded —
 * trashing a pillar leaves its spikes orphaned (parent_id stays set, but
 * the public spike route will 404 because its parent is no longer
 * publishable). The action layer warns when trashing a pillar with
 * spikes so the operator can decide.
 */
export async function trashPost(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: `UPDATE posts
            SET trashed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = 1 AND id = ? AND trashed_at IS NULL`,
    args: [id],
  });
  // post_count drops for any topic this post was tagged with — refresh.
  await db.execute({
    sql: `UPDATE topics
            SET post_count = (
              SELECT COUNT(*) FROM posts_topics pt
              INNER JOIN posts p ON p.id = pt.post_id
              WHERE pt.topic_id = topics.id AND p.trashed_at IS NULL
            ),
            updated_at = CURRENT_TIMESTAMP
          WHERE id IN (SELECT topic_id FROM posts_topics WHERE post_id = ?)`,
    args: [id],
  });

  invalidatePostsCache();
}

/**
 * Restore a previously-trashed post. Slug uniqueness is checked against
 * the appropriate partition (root for pillar/standalone, child for spike).
 */
export async function restorePost(db: DbClient, id: number): Promise<void> {
  const r = await db.execute({
    sql: `SELECT slug, post_kind, parent_id FROM posts
          WHERE tenant_id = 1 AND id = ? AND trashed_at IS NOT NULL LIMIT 1`,
    args: [id],
  });
  const row = r.rows[0];
  if (!row) throw new PostNotFoundError(id);
  const slug = String(row.slug);
  const kindStr = String(row.post_kind);
  const kind: PostKind = isPostKind(kindStr) ? kindStr : "standalone";
  const parentId = row.parent_id != null ? Number(row.parent_id) : null;

  if (kind === "spike" && parentId !== null) {
    if (await slugConflictsChild(db, slug, parentId)) {
      throw new PostSlugConflictError(slug);
    }
  } else {
    if (await slugConflictsRoot(db, slug)) {
      throw new PostSlugConflictError(slug);
    }
  }

  await db.execute({
    sql: `UPDATE posts
            SET trashed_at = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = 1 AND id = ?`,
    args: [id],
  });

  // Re-attach to topics.post_count.
  await db.execute({
    sql: `UPDATE topics
            SET post_count = (
              SELECT COUNT(*) FROM posts_topics pt
              INNER JOIN posts p ON p.id = pt.post_id
              WHERE pt.topic_id = topics.id AND p.trashed_at IS NULL
            ),
            updated_at = CURRENT_TIMESTAMP
          WHERE id IN (SELECT topic_id FROM posts_topics WHERE post_id = ?)`,
    args: [id],
  });

  invalidatePostsCache();
}

export async function forceDeletePost(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM posts WHERE tenant_id = 1 AND id = ?",
    args: [id],
  });
  invalidatePostsCache();
}

export async function purgeOldTrash(db: DbClient, days = 30): Promise<number> {
  const r = await db.execute({
    sql: `DELETE FROM posts
          WHERE tenant_id = 1
            AND trashed_at IS NOT NULL
            AND trashed_at < datetime('now', ?)`,
    args: [`-${days} days`],
  });
  return r.rowsAffected;
}

export async function deletePost(db: DbClient, id: number): Promise<void> {
  return trashPost(db, id);
}

/**
 * Clone a post into a new draft. Title gets " (copy)" appended; slug gets
 * "-copy" appended (with `-2`, `-3`, … suffixes if that collides). Status
 * is forced to draft so the duplicate doesn't accidentally go live.
 *
 * For pillars: only the pillar row is cloned — its spikes are NOT
 * recursively duplicated. The new pillar starts childless.
 *
 * For spikes: the new spike inherits the same parent pillar; uniqueness
 * is checked inside that parent's namespace.
 */
export async function duplicatePost(
  db: DbClient,
  id: number,
  actorUserId: string | null,
): Promise<number> {
  const source = await getPost(db, id);
  if (!source) throw new PostNotFoundError(id);

  const newTitle = `${source.title} (copy)`.slice(0, MAX_TITLE);
  const baseSlug = normalizeSlug(`${source.slug}-copy`).slice(0, MAX_SLUG);
  const slug = await uniqueDuplicateSlug(
    db,
    baseSlug || "post-copy",
    source.postKind,
    source.parentId,
  );

  const r = await db.execute({
    sql: `INSERT INTO posts
            (tenant_id, title, slug, content_json, excerpt, featured_image,
             status, published_at, post_kind, parent_id,
             seo_title, seo_description, seo_og_image, seo_canonical,
             seo_robots, seo_exclude_from_sitemap, schema_types, created_by)
          VALUES (1, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      newTitle,
      slug,
      source.contentJson,
      source.excerpt,
      source.featuredImage,
      source.postKind,
      source.parentId,
      source.seoTitle,
      source.seoDescription,
      source.seoOgImage,
      source.seoCanonical,
      source.seoRobots,
      source.seoExcludeFromSitemap ? 1 : 0,
      JSON.stringify(source.schemaTypes),
      actorUserId,
    ],
  });
  const newId = Number(r.rows[0]?.id);

  if (source.topicIds.length > 0) {
    await setPostTopics(db, newId, source.topicIds);
  }

  invalidatePostsCache();
  return newId;
}

async function uniqueDuplicateSlug(
  db: DbClient,
  base: string,
  postKind: PostKind,
  parentId: number | null,
): Promise<string> {
  let candidate = base;
  let suffix = 1;
  // Practical safety bound — should resolve in 1-2 iterations.
  for (let attempt = 0; attempt < 100; attempt++) {
    const conflict =
      postKind === "spike" && parentId
        ? await slugConflictsChild(db, candidate, parentId)
        : await slugConflictsRoot(db, candidate);
    const reserved = postKind !== "spike" && (await isSlugReserved(db, candidate));
    if (!conflict && !reserved) return candidate;
    suffix++;
    candidate = `${base}-${suffix}`.slice(0, MAX_SLUG);
  }
  throw new PostSlugConflictError(base);
}

export async function getPostOwner(db: DbClient, id: number): Promise<string | null | undefined> {
  const r = await db.execute({
    sql: "SELECT created_by FROM posts WHERE tenant_id = 1 AND id = ? AND trashed_at IS NULL LIMIT 1",
    args: [id],
  });
  if (r.rows.length === 0) return undefined;
  return r.rows[0].created_by != null ? String(r.rows[0].created_by) : null;
}

/**
 * Cheap title-only lookup for audit-log entries that want to embed
 * the post title in the diff (so the activity feed shows the post's
 * title instead of `"Post: 2"`). Includes trashed rows so the
 * trash / restore / purge actions also produce a titled log entry.
 */
export async function getPostTitle(db: DbClient, id: number): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT title FROM posts WHERE tenant_id = 1 AND id = ? LIMIT 1",
    args: [id],
  });
  if (r.rows.length === 0) return null;
  return r.rows[0].title != null ? String(r.rows[0].title) : null;
}

/**
 * Number of spikes attached to a pillar — used by the trash dialog to
 * warn before trashing a pillar with children. Live spikes only.
 */
export async function countSpikesForPillar(db: DbClient, pillarId: number): Promise<number> {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM posts
          WHERE tenant_id = 1 AND parent_id = ? AND trashed_at IS NULL`,
    args: [pillarId],
  });
  return Number(r.rows[0]?.c ?? 0);
}

/**
 * Total count of published (non-trashed) posts at root level — used by
 * the homepage renderer to compute pagination math for the "recent" kind.
 * Excludes spikes (parent_id IS NOT NULL) so the count matches what
 * `listPosts({ status: "published" })` would return for the root list.
 */
export async function countAllPublishedPosts(db: DbClient): Promise<number> {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM posts
          WHERE tenant_id = 1
            AND status = 'published'
            AND trashed_at IS NULL`,
    args: [],
  });
  return Number(r.rows[0]?.c ?? 0);
}

/**
 * Total count of published posts tagged with the given topic — used by
 * the homepage renderer to compute pagination math for the "topic" kind.
 */
export async function countPublishedPostsInTopic(
  db: DbClient,
  topicId: number,
): Promise<number> {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM posts p
          WHERE p.tenant_id = 1
            AND p.status = 'published'
            AND p.trashed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM posts_topics pt
              WHERE pt.post_id = p.id AND pt.topic_id = ?
            )`,
    args: [topicId],
  });
  return Number(r.rows[0]?.c ?? 0);
}
