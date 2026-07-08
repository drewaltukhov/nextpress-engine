/**
 * Pages service — admin CRUD + filtered list view.
 *
 * Visibility rules are enforced one layer up (in actions.ts) via
 * `pages.new` / `pages.draft` permission gates. The service offers a
 * `scope` filter that the action layer uses to restrict the query to
 * a specific author when the caller only has `pages.draft`.
 *
 * Status transitions live here too:
 *   - draft → published: stamps `published_at` (first-time only)
 *   - published → draft: keeps `published_at` (so re-publishing later is
 *     a no-op timestamp; the original publish date is preserved). Drop it
 *     if/when an audience expects re-publish to mean "new public time".
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { normalizeSlug } from "@core/slugs/normalize";
import { isSlugReserved } from "@core/slugs/registry";

export const PAGES_CACHE_TAG = "nextpress:pages";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

export function invalidatePagesCache(): void {
  try {
    updateTag(PAGES_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller relies on revalidate TTL
  }
}
import { PAGE_ROBOTS, PAGE_STATUSES, type PageRobots, type PageStatus } from "./schema/pages";

export class PageSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A page with slug "${slug}" already exists`);
    this.name = "PageSlugConflictError";
  }
}

export class PageSlugReservedError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is reserved and can't be used as a page`);
    this.name = "PageSlugReservedError";
  }
}

export class PageNotFoundError extends Error {
  constructor(id: number) {
    super(`Page ${id} not found`);
    this.name = "PageNotFoundError";
  }
}

export interface PageListItem {
  id: number;
  title: string;
  slug: string;
  status: PageStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Per-page sitemap opt-out — surfaced in the list so the sitemap
   *  iterator can filter without an extra round-trip. */
  seoExcludeFromSitemap: boolean;
  createdBy: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp when the page was moved to trash; null = live. */
  trashedAt: string | null;
  /** NULL = built-in `single-page` template. Otherwise the slug of a
   *  custom theme_data row whose parent_template = 'single-page'. */
  template: string | null;
}

/** Pick which trash partition to read. Defaults to "live" everywhere. */
export type PageView = "live" | "trash";

export interface PageDetail extends PageListItem {
  contentJson: string | null;
  excerpt: string | null;
  seoOgImage: string | null;
  seoCanonical: string | null;
  seoRobots: PageRobots;
  /** Per-page opt-out from /sitemap.xml. */
  seoExcludeFromSitemap: boolean;
  /** Array of schema.org @type strings selected for this page. */
  schemaTypes: string[];
}

export interface AuthorSummary {
  id: string;
  displayName: string;
  pageCount: number;
}

export interface ListPagesFilters {
  /** Match against title, seo_title, seo_description (LIKE ?). */
  search?: string;
  status?: PageStatus | "all";
  /** ISO date (YYYY-MM-DD); matches `updated_at >= startOfDay(date)`. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD); matches `updated_at < startOfDay(date + 1)`. */
  dateTo?: string;
  /** Restrict to one author id. */
  authorId?: string;
  /**
   * Hard scope override: when set, the query is restricted to this user's
   * own rows regardless of `authorId`. The action layer sets this for
   * users who only have `pages.draft`.
   */
  scopeToOwnerId?: string;
  /** Which trash partition to read. Defaults to "live". */
  view?: PageView;
}

const MAX_TITLE = 200;
const MAX_SLUG = 200;
const MAX_EXCERPT = 500;
const MAX_SEO_TITLE = 200;
const MAX_SEO_DESCRIPTION = 500;
const MAX_SEO_URL = 500;

function isPageStatus(s: string): s is PageStatus {
  return (PAGE_STATUSES as readonly string[]).includes(s);
}

function isPageRobots(s: string): s is PageRobots {
  return (PAGE_ROBOTS as readonly string[]).includes(s);
}

function rowToListItem(row: Record<string, unknown>): PageListItem {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    status: String(row.status) as PageStatus,
    publishedAt: row.published_at != null ? String(row.published_at) : null,
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

function rowToDetail(row: Record<string, unknown>): PageDetail {
  const robots = String(row.seo_robots);
  let schemaTypes: string[] = [];
  if (row.schema_types != null) {
    try {
      const parsed = JSON.parse(String(row.schema_types));
      if (Array.isArray(parsed)) {
        schemaTypes = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // Malformed JSON — treat as no types selected. Future writes will overwrite.
    }
  }
  const list = rowToListItem(row);
  return {
    ...list,
    contentJson: row.content_json != null ? String(row.content_json) : null,
    excerpt: row.excerpt != null ? String(row.excerpt) : null,
    seoOgImage: row.seo_og_image != null ? String(row.seo_og_image) : null,
    seoCanonical: row.seo_canonical != null ? String(row.seo_canonical) : null,
    seoRobots: isPageRobots(robots) ? robots : "index,follow",
    seoExcludeFromSitemap: Number(row.seo_exclude_from_sitemap ?? 0) === 1,
    schemaTypes,
  };
}

export async function listPages(db: DbClient, filters: ListPagesFilters = {}): Promise<PageListItem[]> {
  const where: string[] = ["p.tenant_id = 1"];
  const args: (string | number)[] = [];

  // Trash partition. Default = live (trashed_at IS NULL). Pass "trash"
  // to render the trash list view instead.
  const view: PageView = filters.view ?? "live";
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

  // Search hits title, seo title, seo description — covers both the visible
  // header and the hidden meta fields, which matches user expectations of
  // "find the page about widgets" working whether `widgets` is in title or
  // only in the meta description.
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
    // Inclusive end: anything updated on the chosen day counts.
    where.push("p.updated_at < datetime(?, '+1 day')");
    args.push(`${filters.dateTo} 00:00:00`);
  }

  // Trash view sorts by trashed_at desc (most recently trashed first) so
  // restoring something you just deleted is one click away.
  const orderBy = view === "trash"
    ? "p.trashed_at DESC, p.id DESC"
    : "p.updated_at DESC, p.id DESC";

  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.status, p.published_at,
                 p.seo_title, p.seo_description, p.seo_exclude_from_sitemap,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM pages p
          LEFT JOIN users u ON u.id = p.created_by
          WHERE ${where.join(" AND ")}
          ORDER BY ${orderBy}`,
    args,
  });
  return r.rows.map(rowToListItem);
}

/**
 * Fetch a page by id, including trashed rows. Callers that should not
 * surface trashed pages (most edit views) should check `trashedAt` and
 * fall back to the trash UI / 404 themselves. The action layer routes
 * accordingly. Restore + force-delete actions explicitly need to load
 * trashed rows, so this getter does NOT filter them out.
 */
async function getPageRaw(db: DbClient, id: number): Promise<PageDetail | null> {
  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json, p.excerpt,
                 p.status, p.published_at,
                 p.seo_title, p.seo_description, p.seo_og_image,
                 p.seo_canonical, p.seo_robots, p.seo_exclude_from_sitemap,
                 p.schema_types,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM pages p
          LEFT JOIN users u ON u.id = p.created_by
          WHERE p.tenant_id = 1 AND p.id = ?
          LIMIT 1`,
    args: [id],
  });
  const row = r.rows[0];
  return row ? rowToDetail(row) : null;
}

const getPageCached = unstable_cache(
  (id: number): Promise<PageDetail | null> => getPageRaw(getRuntimeDb(), id),
  ["nextpress", "page-detail", "v1"],
  { tags: [PAGES_CACHE_TAG], revalidate: 300 },
);

export async function getPage(db: DbClient, id: number): Promise<PageDetail | null> {
  return cacheOrFallback(() => getPageCached(id), () => getPageRaw(db, id));
}

/**
 * Slug-based lookup for the public `/{slug}` route. Returns only published,
 * non-trashed pages — drafts and trash 404 to non-admins. The shared
 * `[slug]` resolver in the app router calls this first, then falls through
 * to other content types (posts, etc.) when those plugins ship.
 */
async function getPublishedPageBySlugRaw(
  db: DbClient,
  slug: string,
): Promise<PageDetail | null> {
  const r = await db.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json, p.excerpt,
                 p.status, p.published_at,
                 p.seo_title, p.seo_description, p.seo_og_image,
                 p.seo_canonical, p.seo_robots, p.seo_exclude_from_sitemap,
                 p.schema_types,
                 p.created_by,
                 COALESCE(u.display_name, u.email, '(deleted)') AS author_display_name,
                 p.created_at, p.updated_at, p.trashed_at, p.template
          FROM pages p
          LEFT JOIN users u ON u.id = p.created_by
          WHERE p.tenant_id = 1 AND p.slug = ?
            AND p.status = 'published'
            AND p.trashed_at IS NULL
          LIMIT 1`,
    args: [slug],
  });
  const row = r.rows[0];
  return row ? rowToDetail(row) : null;
}

const getPublishedPageBySlugCached = unstable_cache(
  (slug: string): Promise<PageDetail | null> => getPublishedPageBySlugRaw(getRuntimeDb(), slug),
  ["nextpress", "published-page-by-slug", "v1"],
  { tags: [PAGES_CACHE_TAG], revalidate: 300 },
);

export async function getPublishedPageBySlug(
  db: DbClient,
  slug: string,
): Promise<PageDetail | null> {
  return cacheOrFallback(
    () => getPublishedPageBySlugCached(slug),
    () => getPublishedPageBySlugRaw(db, slug),
  );
}

/**
 * Authors known to have pages — used to populate the list-view filter.
 * Restricted to authors with at least one page so the dropdown isn't
 * cluttered with users who've never authored anything.
 */
export async function listAuthors(db: DbClient): Promise<AuthorSummary[]> {
  // Trashed pages don't count toward an author's visible total — same
  // as the list view, which hides them. The dropdown should only show
  // authors who have at least one live page.
  const r = await db.execute({
    sql: `SELECT u.id,
                 COALESCE(u.display_name, u.email, '(deleted)') AS display_name,
                 COUNT(p.id) AS page_count
          FROM pages p
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
    pageCount: Number(row.page_count),
  }));
}

async function slugExists(db: DbClient, slug: string, exceptId?: number): Promise<boolean> {
  // Only check live rows. A trashed page's slug is freed for reuse so
  // an author can re-create a page with the same slug after trashing.
  // Restoring a trashed page whose slug was reclaimed is handled at the
  // restore-action layer (it errors and the user is asked to rename).
  const r = await db.execute({
    sql: exceptId
      ? "SELECT 1 FROM pages WHERE tenant_id = 1 AND slug = ? AND id != ? AND trashed_at IS NULL LIMIT 1"
      : "SELECT 1 FROM pages WHERE tenant_id = 1 AND slug = ? AND trashed_at IS NULL LIMIT 1",
    args: exceptId ? [slug, exceptId] : [slug],
  });
  return r.rows.length > 0;
}

export interface CreatePageInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  status?: PageStatus;
  /** Default schema types selected at creation time. */
  schemaTypes?: string[];
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

export async function createPage(db: DbClient, input: CreatePageInput): Promise<number> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (title.length > MAX_TITLE) throw new Error(`Title must be at most ${MAX_TITLE} characters`);

  const requestedSlug = input.slug?.trim() || title;
  const slug = normalizeSlug(requestedSlug);
  if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
  if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);
  if (await isSlugReserved(db, slug)) throw new PageSlugReservedError(slug);
  if (await slugExists(db, slug)) throw new PageSlugConflictError(slug);

  const excerpt = input.excerpt?.trim() || null;
  if (excerpt && excerpt.length > MAX_EXCERPT) {
    throw new Error(`Excerpt must be at most ${MAX_EXCERPT} characters`);
  }

  const status: PageStatus = input.status && isPageStatus(input.status) ? input.status : "draft";
  const publishedAt = status === "published" ? new Date().toISOString() : null;
  const schemaTypes = input.schemaTypes ? Array.from(new Set(input.schemaTypes)) : [];

  const template = normalizeTemplateInput(input.template);

  const r = await db.execute({
    sql: `INSERT INTO pages (tenant_id, title, slug, excerpt, status, published_at, schema_types, template, created_by)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [title, slug, excerpt, status, publishedAt, JSON.stringify(schemaTypes), template, input.createdBy],
  });
  invalidatePagesCache();
  return Number(r.rows[0]?.id);
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  contentJson?: string | null;
  excerpt?: string | null;
  /** Reassign author. Must reference an existing user id; service does not validate — caller owns this. */
  createdBy?: string | null;
  /**
   * Override the public post date. ISO timestamp. Action layer should
   * gate this — only publishers should reach the service with this set.
   */
  publishedAt?: string | null;
  /** Replace the per-page schema.org @type list. Filtered against catalog upstream. */
  schemaTypes?: string[];
  template?: string | null;
}

export async function updatePage(db: DbClient, id: number, input: UpdatePageInput): Promise<void> {
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
    if (await isSlugReserved(db, slug)) throw new PageSlugReservedError(slug);
    if (await slugExists(db, slug, id)) throw new PageSlugConflictError(slug);
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

  if (input.createdBy !== undefined) {
    sets.push("created_by = ?");
    args.push(input.createdBy);
  }

  if (input.publishedAt !== undefined) {
    sets.push("published_at = ?");
    args.push(input.publishedAt);
  }

  if (input.schemaTypes !== undefined) {
    // De-dupe + JSON.stringify. Validation against the catalog happens in
    // the action layer (so we can map unknown types to a friendly error).
    const unique = Array.from(new Set(input.schemaTypes));
    sets.push("schema_types = ?");
    args.push(JSON.stringify(unique));
  }

  if (input.template !== undefined) {
    sets.push("template = ?");
    args.push(normalizeTemplateInput(input.template));
  }

  if (sets.length === 0) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE pages SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });
  invalidatePagesCache();
}

export interface UpdatePageSeoInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoOgImage?: string | null;
  seoCanonical?: string | null;
  seoRobots?: PageRobots;
  seoExcludeFromSitemap?: boolean;
}

export async function updatePageSeo(db: DbClient, id: number, input: UpdatePageSeoInput): Promise<void> {
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
    if (!isPageRobots(input.seoRobots)) throw new Error("Invalid robots value");
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
    sql: `UPDATE pages SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });
}

export async function setPageStatus(db: DbClient, id: number, status: PageStatus): Promise<void> {
  if (!isPageStatus(status)) throw new Error("Invalid status");

  // First-time publish stamps published_at; subsequent toggles preserve
  // the original timestamp (so unpublishing then re-publishing keeps the
  // original public date intact).
  if (status === "published") {
    await db.execute({
      sql: `UPDATE pages
              SET status = 'published',
                  published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
                  updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = 1 AND id = ?`,
      args: [id],
    });
  } else {
    await db.execute({
      sql: `UPDATE pages
              SET status = 'draft',
                  updated_at = CURRENT_TIMESTAMP
            WHERE tenant_id = 1 AND id = ?`,
      args: [id],
    });
  }
  invalidatePagesCache();
}

/**
 * Soft-delete: move a page to trash. The row stays around for 30 days
 * (or until force-purged) so it can be restored. Slug is freed up for
 * reuse the moment this returns — the unique slug index is partial and
 * excludes trashed rows.
 */
export async function trashPage(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: `UPDATE pages
            SET trashed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = 1 AND id = ? AND trashed_at IS NULL`,
    args: [id],
  });
  invalidatePagesCache();
}

/**
 * Restore a previously-trashed page. Errors if the page's slug has been
 * claimed by a live row in the meantime — the caller should prompt the
 * user to rename.
 */
export async function restorePage(db: DbClient, id: number): Promise<void> {
  // Fetch the trashed row's slug so we can verify uniqueness against
  // live rows before clearing trashed_at.
  const r = await db.execute({
    sql: "SELECT slug FROM pages WHERE tenant_id = 1 AND id = ? AND trashed_at IS NOT NULL LIMIT 1",
    args: [id],
  });
  const row = r.rows[0];
  if (!row) throw new PageNotFoundError(id);
  const slug = String(row.slug);
  if (await slugExists(db, slug)) {
    throw new PageSlugConflictError(slug);
  }
  await db.execute({
    sql: `UPDATE pages
            SET trashed_at = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = 1 AND id = ?`,
    args: [id],
  });
  invalidatePagesCache();
}

/**
 * Permanently delete a page (no undo). Used by the trash UI's "Delete
 * permanently" action and by `purgeOldTrash`. The original
 * `deletePage` was a hard DELETE — this preserves that behaviour under
 * a clearer name. The exported `deletePage` is now a soft-delete alias
 * for `trashPage` so existing callers keep working.
 */
export async function forceDeletePage(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM pages WHERE tenant_id = 1 AND id = ?",
    args: [id],
  });
  invalidatePagesCache();
}

/**
 * Cleanup job — permanently delete trashed pages older than `days`.
 * Returns the number of rows purged. Idempotent: cutoffs are computed
 * at call time so running twice in a row simply finds nothing on the
 * second pass.
 */
export async function purgeOldTrash(db: DbClient, days = 30): Promise<number> {
  const r = await db.execute({
    sql: `DELETE FROM pages
          WHERE tenant_id = 1
            AND trashed_at IS NOT NULL
            AND trashed_at < datetime('now', ?)`,
    args: [`-${days} days`],
  });
  return r.rowsAffected;
}

/**
 * Soft-delete alias kept for callers that still reference `deletePage`.
 * Routes to `trashPage` so the everyday "Delete" button in the admin
 * moves the row to trash rather than wiping it. The original hard-
 * delete is exposed as `forceDeletePage` for the trash UI's "Delete
 * permanently" path and the cleanup job.
 */
export async function deletePage(db: DbClient, id: number): Promise<void> {
  return trashPage(db, id);
}

/**
 * Clone a page into a new draft. Title gets " (copy)" appended; slug gets
 * "-copy" appended (with `-2`, `-3`, … suffixes if that collides). Status
 * is forced to draft so the duplicate doesn't accidentally go live.
 */
export async function duplicatePage(
  db: DbClient,
  id: number,
  actorUserId: string | null,
): Promise<number> {
  const source = await getPage(db, id);
  if (!source) throw new Error("Page not found");

  const newTitle = `${source.title} (copy)`.slice(0, MAX_TITLE);
  const baseSlug = normalizeSlug(`${source.slug}-copy`).slice(0, MAX_SLUG) || "page-copy";
  const slug = await uniqueDuplicateSlug(db, baseSlug);

  const r = await db.execute({
    sql: `INSERT INTO pages
            (tenant_id, title, slug, content_json, excerpt,
             status, published_at,
             seo_title, seo_description, seo_og_image, seo_canonical,
             seo_robots, seo_exclude_from_sitemap, schema_types, created_by)
          VALUES (1, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      newTitle,
      slug,
      source.contentJson,
      source.excerpt,
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
  invalidatePagesCache();
  return Number(r.rows[0]?.id);
}

async function uniqueDuplicateSlug(db: DbClient, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (let attempt = 0; attempt < 100; attempt++) {
    const reserved = await isSlugReserved(db, candidate);
    const exists = await slugExists(db, candidate);
    if (!reserved && !exists) return candidate;
    suffix++;
    candidate = `${base}-${suffix}`.slice(0, MAX_SLUG);
  }
  throw new PageSlugConflictError(base);
}

/**
 * Read just the owner — cheap helper used by action-level permission
 * gates. Trashed rows return undefined so edit/publish/delete actions
 * naturally route to "page not found" without an explicit trash check.
 * The trash-specific actions (restore, force-delete) load the row via
 * `getPage` instead, which does NOT filter trashed rows.
 */
export async function getPageOwner(db: DbClient, id: number): Promise<string | null | undefined> {
  const r = await db.execute({
    sql: "SELECT created_by FROM pages WHERE tenant_id = 1 AND id = ? AND trashed_at IS NULL LIMIT 1",
    args: [id],
  });
  if (r.rows.length === 0) return undefined;
  return r.rows[0].created_by != null ? String(r.rows[0].created_by) : null;
}

/**
 * Cheap title-only lookup for audit-log entries that want to embed
 * the page title in the diff (so the activity feed can show
 * `"About"` instead of `"Page: 2"`). Includes trashed rows so the
 * trash / restore / purge actions also produce a titled log entry.
 */
export async function getPageTitle(db: DbClient, id: number): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT title FROM pages WHERE tenant_id = 1 AND id = ? LIMIT 1",
    args: [id],
  });
  if (r.rows.length === 0) return null;
  return r.rows[0].title != null ? String(r.rows[0].title) : null;
}
