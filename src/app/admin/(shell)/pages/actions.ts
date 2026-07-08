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
import { SYSTEM_ROLE_ORDER, SYSTEM_ROLE_SLUGS } from "../roles/entities";
import {
  listPages,
  getPage,
  listAuthors,
  createPage,
  updatePage,
  updatePageSeo,
  setPageStatus,
  trashPage,
  restorePage,
  forceDeletePage,
  duplicatePage,
  getPageOwner,
  getPageTitle,
  PageSlugConflictError,
  PageSlugReservedError,
  PageNotFoundError,
  type PageListItem,
  type PageDetail,
  type AuthorSummary,
  type ListPagesFilters,
  type PageStatus,
  type PageRobots,
} from "@core-plugins/pages";

export type SaveResult = { ok: true; id?: number } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Permission matrix (sourced from ROLE_ENTITIES.pages):
//   pages.new   → see all, edit all, publish/unpublish, delete (admin/editor)
//   pages.draft → create + edit only OWN drafts; can't publish; can't delete
// ---------------------------------------------------------------------------

interface PagesActor {
  userId: string;
  hasNew: boolean;
  hasDraft: boolean;
  /** True iff the actor has the global wildcard `*` (admin role). */
  isAdmin: boolean;
  canEditPage: (ownerId: string | null | undefined) => boolean;
  canPublish: boolean;
  canDelete: boolean;
}

async function actorFromSession(): Promise<{ ok: true; actor: PagesActor } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const userId = await resolveUserId(db(), session.user);
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  const hasNew = hasPermission(perms, "pages.new");
  const hasDraft = hasPermission(perms, "pages.draft");
  const isAdmin = perms.has("*");
  if (!hasNew && !hasDraft) {
    return { ok: false, error: "You don't have permission to manage pages" };
  }
  return {
    ok: true,
    actor: {
      userId,
      hasNew,
      hasDraft,
      isAdmin,
      canEditPage: (ownerId) => hasNew || (hasDraft && !!userId && ownerId === userId),
      canPublish: hasNew,
      canDelete: hasNew,
    },
  };
}

async function commonGuard(): Promise<{ ok: true; actor: PagesActor } | { ok: false; error: string }> {
  const got = await actorFromSession();
  if (!got.ok) return got;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  return got;
}

// ---------------------------------------------------------------------------
// Permissions snapshot — used by the page server-component to gate UI
// ---------------------------------------------------------------------------

export interface PagesPermissions {
  userId: string | null;
  /** True for admin/editor; controls visibility of author filter and Publish/Delete UI. */
  canSeeAll: boolean;
  canPublish: boolean;
  canDelete: boolean;
  /** Strict admin (wildcard `*`) — gates author reassignment in the edit form. */
  isAdmin: boolean;
}

export async function getPagesPermissions(): Promise<PagesPermissions> {
  const got = await actorFromSession();
  if (!got.ok) {
    return { userId: null, canSeeAll: false, canPublish: false, canDelete: false, isAdmin: false };
  }
  return {
    userId: got.actor.userId,
    canSeeAll: got.actor.hasNew,
    canPublish: got.actor.canPublish,
    canDelete: got.actor.canDelete,
    isAdmin: got.actor.isAdmin,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPagesList(filters: ListPagesFilters = {}): Promise<PageListItem[]> {
  const got = await actorFromSession();
  if (!got.ok) return [];
  const scoped: ListPagesFilters = got.actor.hasNew
    ? filters
    : { ...filters, scopeToOwnerId: got.actor.userId };
  return listPages(db(), scoped);
}

export async function getPagesAuthors(): Promise<AuthorSummary[]> {
  const got = await actorFromSession();
  // Author filter is only meaningful for users who can see all pages —
  // a draft-only author would just see themselves.
  if (!got.ok || !got.actor.hasNew) return [];
  return listAuthors(db());
}

export type AuthorRoleKind = "admin" | "editor" | "author" | "custom" | "none";

export interface AuthorOption {
  id: string;
  displayName: string;
  email: string;
  /** All role slugs the user holds — useful for tooltips/details. */
  roleSlugs: string[];
  /**
   * Coarse category for the dropdown icon. Picked as the highest-privilege
   * system role the user holds (admin → editor → author); falls back to
   * "custom" when the user has only non-system roles, or "none" when they
   * have no roles at all.
   */
  roleKind: AuthorRoleKind;
}

function classifyRoles(slugs: string[]): AuthorRoleKind {
  if (slugs.length === 0) return "none";
  for (const sys of SYSTEM_ROLE_ORDER) {
    if (slugs.includes(sys)) return sys as AuthorRoleKind;
  }
  // Has roles but none are system roles → custom.
  if (slugs.some((s) => !SYSTEM_ROLE_SLUGS.has(s))) return "custom";
  return "none";
}

/**
 * Full user list for the "Author" select on the page edit form. Admin-only —
 * non-admins can't reassign authors anyway. Returns empty for non-admins so
 * the UI can render itself off as a no-op. Aggregates the user's roles so
 * the UI can render a role icon next to the display name.
 */
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

/**
 * Schemas the operator has marked "installed" on the SEO admin (subset of
 * the catalog, persisted in the `seo.enabled_schemas` setting). The page
 * edit form uses this to populate its Schemas card; `Article` is the
 * suggested default for new pages when it's installed.
 */
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

export async function getPageDetail(id: number): Promise<PageDetail | null> {
  const got = await actorFromSession();
  if (!got.ok) return null;
  const page = await getPage(db(), id);
  if (!page) return null;
  if (!got.actor.canEditPage(page.createdBy)) return null;
  return page;
}

/**
 * Compute the JSON-LD nodes that would be emitted for this page on the
 * public render. Powers the SEO dialog's Schema Checkup tab.
 *
 * Mirrors `buildPageJsonLdNodes` in `published-view.tsx` exactly — same
 * inputs, same ordering, same suppression rules — so the preview matches
 * what crawlers see.
 */
export interface PageSchemaPreview {
  /** Each `object` is one schema.org node (Article, FAQPage, BreadcrumbList, …). */
  nodes: object[];
  /** Surfaced in the UI when there's a non-content reason for the empty
   *  result (`noindex` on the page or site-level `discourageIndexing`). */
  suppressionReason: "noindex" | "discourage_indexing" | null;
  /** The canonical URL the public render would use. Shown above the nodes
   *  so the admin can sanity-check that schemas reference the right URL. */
  canonical: string;
}

export async function getPageSchemaPreview(id: number): Promise<PageSchemaPreview | null> {
  const got = await actorFromSession();
  if (!got.ok) return null;
  const page = await getPage(db(), id);
  if (!page) return null;
  if (!got.actor.canEditPage(page.createdBy)) return null;

  // Lazy imports — these reach into core-plugins/pages/published-view.tsx
  // which pulls in `@measured/puck` (large client surface). Keeping the
  // import inside the function means the bundle for action callers that
  // never invoke this stays slim.
  const { buildPageJsonLdNodes, parsePuckData } = await import(
    "@core-plugins/pages/published-view"
  );

  const [siteUrlSetting, siteTitle, defaultOgImage, discourageIndexing, breadcrumbEnabled] =
    await Promise.all([
      getSetting<string>(db(), "site.url"),
      getSetting<string>(db(), "site.title"),
      getSetting<string>(db(), "seo.default_og_image"),
      getSetting<boolean>(db(), "seo.discourage_indexing"),
      getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    ]);

  const siteUrl = siteUrlSetting ?? "";
  const trimmedSiteUrl = siteUrl.replace(/\/$/, "");

  // Match the canonical resolution in /[slug]/page.tsx: respect the page's
  // explicit seoCanonical when set, else compose from siteUrl + slug.
  const canonical =
    page.seoCanonical?.trim() ||
    (trimmedSiteUrl ? `${trimmedSiteUrl}/${page.slug}` : `/${page.slug}`);

  const data = parsePuckData(page.contentJson);

  const nodes = buildPageJsonLdNodes({
    page,
    seo: {
      siteTitle: siteTitle ?? "",
      siteUrl,
      defaultOgImage: defaultOgImage ?? "",
      discourageIndexing: discourageIndexing ?? false,
    },
    canonical,
    data,
    breadcrumbEnabled: breadcrumbEnabled ?? true,
  });

  let suppressionReason: PageSchemaPreview["suppressionReason"] = null;
  if (nodes.length === 0) {
    if (discourageIndexing) suppressionReason = "discourage_indexing";
    else if (page.seoRobots.startsWith("noindex")) suppressionReason = "noindex";
  }

  return { nodes, suppressionReason, canonical };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreatePageActionInput {
  title: string;
  slug?: string;
  excerpt?: string;
  /** Only honored when the actor has pages.new — otherwise forced to draft. */
  status?: PageStatus;
  /** Default schema types — filtered against installed catalog before save. */
  schemaTypes?: string[];
  /** Slug of a custom Single Page template, or "" / null for the
   *  built-in default. */
  template?: string | null;
}

export async function createPageAction(input: CreatePageActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  // Authors can only create drafts; publishers can pick.
  const status: PageStatus =
    input.status === "published" && guard.actor.canPublish ? "published" : "draft";

  // Schema types must be in the installed (and master catalog) set. Anything
  // outside is silently dropped — the UI shouldn't be sending them, but a
  // stale client could.
  const schemaTypes = input.schemaTypes
    ? await filterToInstalledSchemas(input.schemaTypes)
    : [];

  let id: number;
  try {
    id = await createPage(db(), {
      title: input.title,
      slug: input.slug?.trim() || undefined,
      excerpt: input.excerpt ?? null,
      status,
      schemaTypes,
      template: input.template ?? null,
      createdBy: guard.actor.userId,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.created",
      targetType: "page",
      targetId: String(id),
      diff: { title: input.title.trim(), slug: input.slug?.trim() || undefined, status, schemaTypes },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  return { ok: true, id };
}

async function filterToInstalledSchemas(types: string[]): Promise<string[]> {
  const enabled = await getSetting<string[]>(db(), "seo.enabled_schemas");
  const enabledSet = new Set(Array.isArray(enabled) ? enabled : []);
  return types.filter((t) => SCHEMA_CATALOG_TYPES.has(t) && enabledSet.has(t));
}

export interface UpdatePageActionInput {
  title?: string;
  slug?: string;
  contentJson?: string | null;
  excerpt?: string | null;
  /** Reassign author. Admin-only — non-admins receive an error if this is set. */
  createdBy?: string | null;
  /**
   * Override the public post date. ISO string or null. Gated on canPublish
   * (admin/editor) — drafts can hold a value but it only surfaces on publish.
   */
  publishedAt?: string | null;
  /** Replace per-page schema types. Filtered against installed catalog before save. */
  schemaTypes?: string[];
  template?: string | null;
}

export async function updatePageAction(id: number, input: UpdatePageActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPageOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Page not found" };
  if (!guard.actor.canEditPage(owner)) {
    return { ok: false, error: "You can only edit pages you authored" };
  }

  // Per-field gating beyond the basic "can edit" check.
  if (input.createdBy !== undefined && !guard.actor.isAdmin) {
    return { ok: false, error: "Only administrators can reassign page authors" };
  }
  if (input.publishedAt !== undefined && !guard.actor.canPublish) {
    return { ok: false, error: "Only publishers can change the post date" };
  }

  // Validate publishedAt parses if non-null.
  if (input.publishedAt) {
    const parsed = new Date(input.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Invalid post date" };
    }
  }

  // Validate createdBy exists when reassigning.
  if (input.createdBy) {
    const r = await db().execute({
      sql: "SELECT 1 FROM users WHERE tenant_id = 1 AND id = ? LIMIT 1",
      args: [input.createdBy],
    });
    if (r.rows.length === 0) {
      return { ok: false, error: "Author not found" };
    }
  }

  // Filter schema types against installed catalog.
  const filteredSchemaTypes = input.schemaTypes !== undefined
    ? await filterToInstalledSchemas(input.schemaTypes)
    : undefined;

  // Snapshot pre-update slug so we can auto-create a /<slug> redirect if
  // it changes. Pages are always top-level so there's no parent shape to
  // track.
  const before = await getPage(db(), id);

  try {
    await updatePage(db(), id, {
      ...input,
      schemaTypes: filteredSchemaTypes,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Resolve the canonical title for the audit-log diff so the
  // activity feed always shows it — even when the update didn't
  // touch the title field. Falls back to `input.title` when the
  // helper read fails (e.g. row vanished mid-flight).
  let canonicalTitle: string | null = input.title ?? null;
  try {
    const t = await getPageTitle(db(), id);
    if (t != null) canonicalTitle = t;
  } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.updated",
      targetType: "page",
      targetId: String(id),
      diff: {
        ...input,
        title: canonicalTitle ?? undefined,
        schemaTypes: filteredSchemaTypes,
        contentJson: input.contentJson != null ? "(json)" : undefined,
      },
    });
  } catch { /* audit non-fatal */ }

  // Auto-redirect on slug change. createAutoRedirect honors the per-source
  // admin toggle and swallows its own errors.
  try {
    if (before) {
      const after = await getPage(db(), id);
      if (after && before.slug !== after.slug) {
        await createAutoRedirect(db(), {
          fromPath: `/${before.slug}`,
          toPath: `/${after.slug}`,
          source: "slug_change",
          createdBy: guard.actor.userId,
        });
      }
    }
  } catch { /* redirect creation non-fatal */ }

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}/edit`);
  return { ok: true, id };
}

export interface UpdatePageSeoActionInput {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoOgImage?: string | null;
  seoCanonical?: string | null;
  seoRobots?: PageRobots;
  seoExcludeFromSitemap?: boolean;
}

export async function updatePageSeoAction(id: number, input: UpdatePageSeoActionInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPageOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Page not found" };
  if (!guard.actor.canEditPage(owner)) {
    return { ok: false, error: "You can only edit pages you authored" };
  }

  try {
    await updatePageSeo(db(), id, input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Resolve the page's canonical title so the activity feed shows
  // which page got its SEO updated (instead of `Page: 2`). Failure
  // is non-fatal — the audit row still gets the id.
  let seoTitle: string | null = null;
  try { seoTitle = await getPageTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.seoUpdated",
      targetType: "page",
      targetId: String(id),
      diff: { ...input, title: seoTitle ?? undefined },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}/edit`);
  return { ok: true, id };
}

export async function setPageStatusAction(id: number, status: PageStatus): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canPublish) {
    return { ok: false, error: "Only publishers can change visibility" };
  }

  const owner = await getPageOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Page not found" };

  try {
    await setPageStatus(db(), id, status);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Capture the title for the audit-log diff so the activity feed
  // shows `"About"` instead of `"Page: 2"`. Failure (page deleted
  // mid-flight, etc.) is non-fatal — the audit row still gets the id.
  let title: string | null = null;
  try { title = await getPageTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: status === "published" ? "pages.published" : "pages.unpublished",
      targetType: "page",
      targetId: String(id),
      diff: title ? { title, status } : { status },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}/edit`);
  return { ok: true, id };
}

/**
 * Soft-delete (move to trash). Used for the "Delete" button in the live
 * pages list. Pages stay in trash for 30 days before the cleanup job
 * permanently removes them; can be restored from the Trash view in
 * that window.
 */
export async function deletePageAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can delete pages" };
  }

  const owner = await getPageOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Page not found" };

  // Capture the title BEFORE trashing — `getPageTitle` accepts
  // trashed rows but doing the read up-front keeps the audit-log
  // write path identical regardless of how the underlying delete
  // implementation evolves.
  let title: string | null = null;
  try { title = await getPageTitle(db(), id); } catch { /* audit non-fatal */ }
  try {
    await trashPage(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.trashed",
      targetType: "page",
      targetId: String(id),
      diff: title ? { title } : undefined,
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  return { ok: true };
}

/**
 * Duplicate a page into a new draft. Permission model: anyone who can
 * edit the source can duplicate it (a duplicate is a brand-new draft;
 * the actor becomes the new row's owner).
 */
export async function duplicatePageAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const owner = await getPageOwner(db(), id);
  if (owner === undefined) return { ok: false, error: "Page not found" };
  if (!guard.actor.canEditPage(owner)) {
    return { ok: false, error: "You can only duplicate pages you authored" };
  }

  let newId: number;
  try {
    newId = await duplicatePage(db(), id, guard.actor.userId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.duplicated",
      targetType: "page",
      targetId: String(newId),
      diff: { sourceId: id },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  return { ok: true, id: newId };
}

/**
 * Restore a previously-trashed page. Errors if the page's slug has been
 * claimed by a live row in the meantime — the user can rename in the
 * edit screen and try again.
 */
export async function restorePageAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can restore pages" };
  }

  // Load including trashed rows — getPage doesn't filter trash, only
  // getPageOwner does.
  const page = await getPage(db(), id);
  if (!page) return { ok: false, error: "Page not found" };
  if (!page.trashedAt) return { ok: false, error: "Page is not in trash" };

  try {
    await restorePage(db(), id);
  } catch (err) {
    if (err instanceof PageSlugConflictError) {
      return {
        ok: false,
        error: `A live page with slug "${page.slug}" already exists. Rename it before restoring this one.`,
      };
    }
    if (err instanceof PageNotFoundError) {
      return { ok: false, error: "Page not found" };
    }
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.restored",
      targetType: "page",
      targetId: String(id),
      // `page` was loaded above (line ~585) and includes the title.
      diff: { title: page.title },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  return { ok: true };
}

/**
 * Permanently delete a page from trash. No undo. Available only on
 * trashed rows from the trash UI's "Delete permanently" action.
 */
export async function forceDeletePageAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (!guard.actor.canDelete) {
    return { ok: false, error: "Only publishers can permanently delete pages" };
  }

  const page = await getPage(db(), id);
  if (!page) return { ok: false, error: "Page not found" };
  if (!page.trashedAt) {
    return { ok: false, error: "Move the page to trash before permanently deleting it." };
  }

  try {
    await forceDeletePage(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.actor.userId,
      action: "pages.purged",
      targetType: "page",
      targetId: String(id),
      // `page` was loaded above (line ~628) for the trashed-state
      // check and includes the title.
      diff: { title: page.title },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/pages");
  return { ok: true };
}

function errorMessage(err: unknown): string {
  if (err instanceof PageSlugConflictError) return err.message;
  if (err instanceof PageSlugReservedError) return err.message;
  if (err instanceof PageNotFoundError) return err.message;
  return err instanceof Error ? err.message : "Save failed";
}
