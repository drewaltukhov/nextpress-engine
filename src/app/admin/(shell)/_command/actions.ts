"use server";

import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";

/**
 * Admin command-palette server actions.
 *
 * Two functions:
 *   - searchAdmin(q)       — substring search across pages, posts, users,
 *                             topics, and media; permission-gated per resource.
 *   - getCommandPaletteSeed() — empty-query payload: recent edits derived from
 *                                the audit log + permission-filtered quick
 *                                actions for the empty state.
 *
 * Substring `LIKE %q%` is fine at this scale (single-tenant, hundreds of
 * rows). If post counts grow into the thousands swap for FTS5 — same shape,
 * faster.
 */

export type CommandHitKind = "post" | "page" | "user" | "topic" | "media";

export interface CommandHit {
  kind: CommandHitKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Tiny status / context word, rendered as a pill on the right. */
  badge: string | null;
}

export interface SearchResult {
  hits: CommandHit[];
  truncated: boolean;
}

export interface QuickAction {
  label: string;
  description: string;
  href: string;
  kind: CommandHitKind;
}

export interface CommandPaletteSeed {
  recents: CommandHit[];
  quickActions: QuickAction[];
}

const PER_RESOURCE_LIMIT = 5;

interface Actor {
  userId: string | null;
  isAdmin: boolean;
  can: (action: string) => boolean;
}

async function loadActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const roles = (session.user.roles ?? []) as string[];
  const perms = await getEffectivePermissions(db(), roles);
  return {
    userId: session.user.id,
    isAdmin: roles.includes("admin"),
    can: (action) => hasPermission(perms, action),
  };
}

function escapeLike(raw: string): string {
  return raw.replace(/[%_\\]/g, (m) => `\\${m}`);
}

// ---------------------------------------------------------------------------
// Search across resources
// ---------------------------------------------------------------------------

export async function searchAdmin(query: string): Promise<SearchResult> {
  const actor = await loadActor();
  if (!actor) return { hits: [], truncated: false };

  const trimmed = query.trim();
  if (trimmed.length < 1) return { hits: [], truncated: false };

  const term = `%${escapeLike(trimmed)}%`;
  const canPosts = actor.can("posts.read") || actor.can("posts.draft") || actor.isAdmin;
  const canPages = actor.can("pages.read") || actor.can("pages.draft") || actor.isAdmin;
  const canUsers = actor.isAdmin;
  const canTopics = true; // visible inside admin shell to anyone
  const canMedia = true;

  // Run every resource query in parallel — each is small + indexed, total
  // round-trip is bounded by the slowest single query.
  const [postRows, pageRows, userRows, topicRows, mediaRows] = await Promise.all([
    canPosts
      ? db().execute({
          sql: `SELECT p.id, p.title, p.slug, p.status, p.post_kind,
                       parent.slug AS parent_slug
                FROM posts p
                LEFT JOIN posts parent ON parent.id = p.parent_id
                WHERE p.tenant_id = 1
                  AND p.trashed_at IS NULL
                  AND (p.title LIKE ? ESCAPE '\\' OR p.slug LIKE ? ESCAPE '\\')
                ORDER BY p.updated_at DESC
                LIMIT ?`,
          args: [term, term, PER_RESOURCE_LIMIT],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    canPages
      ? db().execute({
          sql: `SELECT id, title, slug, status
                FROM pages
                WHERE tenant_id = 1
                  AND trashed_at IS NULL
                  AND (title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')
                ORDER BY updated_at DESC
                LIMIT ?`,
          args: [term, term, PER_RESOURCE_LIMIT],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    canUsers
      ? db().execute({
          sql: `SELECT id, display_name, email, status
                FROM users
                WHERE tenant_id = 1
                  AND status != 'disabled'
                  AND (display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
                ORDER BY display_name COLLATE NOCASE ASC
                LIMIT ?`,
          args: [term, term, PER_RESOURCE_LIMIT],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    canTopics
      ? db().execute({
          sql: `SELECT id, name, slug, description, post_count
                FROM topics
                WHERE tenant_id = 1
                  AND (name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
                ORDER BY name COLLATE NOCASE ASC
                LIMIT ?`,
          args: [term, term, term, PER_RESOURCE_LIMIT],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    canMedia
      ? db().execute({
          sql: `SELECT id, filename, mime, size_bytes
                FROM media
                WHERE tenant_id = 1
                  AND filename LIKE ? ESCAPE '\\'
                ORDER BY uploaded_at DESC
                LIMIT ?`,
          args: [term, PER_RESOURCE_LIMIT],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  const hits: CommandHit[] = [];

  for (const row of postRows.rows) {
    const id = Number(row.id);
    const slug = String(row.slug);
    const kind = String(row.post_kind);
    const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
    const status = String(row.status);
    let subtitle = `/${slug}`;
    if (kind === "spike" && parentSlug) subtitle = `/${parentSlug}/${slug}`;
    hits.push({
      kind: "post",
      id: String(id),
      title: String(row.title),
      subtitle,
      href: `/admin/posts/${id}/edit`,
      badge: status === "published" ? "Published" : "Draft",
    });
  }
  for (const row of pageRows.rows) {
    const id = Number(row.id);
    const status = String(row.status);
    hits.push({
      kind: "page",
      id: String(id),
      title: String(row.title),
      subtitle: `/${String(row.slug)}`,
      href: `/admin/pages/${id}/edit`,
      badge: status === "published" ? "Published" : "Draft",
    });
  }
  for (const row of userRows.rows) {
    const id = String(row.id);
    hits.push({
      kind: "user",
      id,
      title: String(row.display_name),
      subtitle: String(row.email),
      href: `/admin/users/${id}/edit`,
      badge: row.status === "invited" ? "Invited" : null,
    });
  }
  for (const row of topicRows.rows) {
    const id = Number(row.id);
    const postCount = Number(row.post_count ?? 0);
    hits.push({
      kind: "topic",
      id: String(id),
      title: String(row.name),
      subtitle: row.description ? String(row.description) : `/${String(row.slug)}`,
      href: `/admin/topics`,
      badge: postCount > 0 ? `${postCount} ${postCount === 1 ? "post" : "posts"}` : null,
    });
  }
  for (const row of mediaRows.rows) {
    const id = String(row.id);
    const sizeKb = Math.round(Number(row.size_bytes ?? 0) / 1024);
    hits.push({
      kind: "media",
      id,
      title: String(row.filename),
      subtitle: String(row.mime),
      href: `/admin/media/${id}`,
      badge: `${sizeKb.toLocaleString()} KB`,
    });
  }

  // Truncated = at least one resource returned exactly the per-resource cap.
  // We can't tell from a single query whether more rows exist, so this is a
  // conservative "we may have hidden some" hint for the UI footer.
  const truncated =
    postRows.rows.length === PER_RESOURCE_LIMIT ||
    pageRows.rows.length === PER_RESOURCE_LIMIT ||
    userRows.rows.length === PER_RESOURCE_LIMIT ||
    topicRows.rows.length === PER_RESOURCE_LIMIT ||
    mediaRows.rows.length === PER_RESOURCE_LIMIT;

  return { hits, truncated };
}

// ---------------------------------------------------------------------------
// Empty-state seed: recent edits + quick actions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS: ReadonlyArray<{
  action: QuickAction;
  permission: string;
}> = [
  {
    action: {
      label: "New post",
      description: "Pillar, spike, or standalone post.",
      href: "/admin/posts/new",
      kind: "post",
    },
    permission: "posts.draft",
  },
  {
    action: {
      label: "New page",
      description: "Static content (about, contact, landing).",
      href: "/admin/pages/new",
      kind: "page",
    },
    permission: "pages.draft",
  },
  {
    action: {
      label: "New topic",
      description: "Create a topic to tag posts.",
      href: "/admin/topics?new=1",
      kind: "topic",
    },
    permission: "topics.manage",
  },
  {
    action: {
      label: "Upload media",
      description: "Open the media library upload tab.",
      href: "/admin/media?tab=upload",
      kind: "media",
    },
    permission: "media.add",
  },
];

export async function getCommandPaletteSeed(): Promise<CommandPaletteSeed> {
  const actor = await loadActor();
  if (!actor) return { recents: [], quickActions: [] };

  const quickActions = QUICK_ACTIONS.filter((q) =>
    actor.isAdmin || actor.can(q.permission),
  ).map((q) => q.action);

  // Recent items: walk the audit log for this user's most recent edits to
  // resources the palette knows how to render. Deduplicate by (type, id) and
  // keep only the freshest event per pair.
  let recents: CommandHit[] = [];
  if (actor.userId) {
    const recentRows = await db().execute({
      sql: `SELECT MAX(created_at) AS last_at, target_type, target_id
            FROM audit_log
            WHERE tenant_id = 1
              AND actor_user_id = ?
              AND target_type IN ('post', 'page', 'topic', 'media')
              AND (action LIKE '%.update' OR action LIKE '%.create'
                   OR action LIKE '%.publish' OR action = 'media.upload')
            GROUP BY target_type, target_id
            ORDER BY last_at DESC
            LIMIT 8`,
      args: [actor.userId],
    });

    const buckets: Record<string, string[]> = { post: [], page: [], topic: [], media: [] };
    const ordering: Array<{ type: string; id: string }> = [];
    for (const row of recentRows.rows) {
      const type = String(row.target_type);
      const id = String(row.target_id ?? "");
      if (!id || !(type in buckets)) continue;
      buckets[type].push(id);
      ordering.push({ type, id });
    }

    // Resolve titles per bucket in parallel — separate queries because the
    // resource id types differ (integer for post/page/topic, uuid string for
    // media) and forcing a UNION across them would just complicate things.
    const titleMap = new Map<string, CommandHit>();
    await Promise.all([
      buckets.post.length > 0
        ? hydratePosts(buckets.post).then((rs) => {
            for (const h of rs) titleMap.set(`post:${h.id}`, h);
          })
        : null,
      buckets.page.length > 0
        ? hydratePages(buckets.page).then((rs) => {
            for (const h of rs) titleMap.set(`page:${h.id}`, h);
          })
        : null,
      buckets.topic.length > 0
        ? hydrateTopics(buckets.topic).then((rs) => {
            for (const h of rs) titleMap.set(`topic:${h.id}`, h);
          })
        : null,
      buckets.media.length > 0
        ? hydrateMedia(buckets.media).then((rs) => {
            for (const h of rs) titleMap.set(`media:${h.id}`, h);
          })
        : null,
    ]);

    recents = ordering
      .map(({ type, id }) => titleMap.get(`${type}:${id}`))
      .filter((h): h is CommandHit => Boolean(h))
      .slice(0, 6);
  }

  return { recents, quickActions };
}

async function hydratePosts(ids: string[]): Promise<CommandHit[]> {
  const placeholders = ids.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT p.id, p.title, p.slug, p.status, p.post_kind,
                 parent.slug AS parent_slug
          FROM posts p
          LEFT JOIN posts parent ON parent.id = p.parent_id
          WHERE p.tenant_id = 1 AND p.trashed_at IS NULL AND p.id IN (${placeholders})`,
    args: ids,
  });
  return r.rows.map((row) => {
    const id = Number(row.id);
    const slug = String(row.slug);
    const kind = String(row.post_kind);
    const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
    let subtitle = `/${slug}`;
    if (kind === "spike" && parentSlug) subtitle = `/${parentSlug}/${slug}`;
    return {
      kind: "post" as const,
      id: String(id),
      title: String(row.title),
      subtitle,
      href: `/admin/posts/${id}/edit`,
      badge: String(row.status) === "published" ? "Published" : "Draft",
    };
  });
}

async function hydratePages(ids: string[]): Promise<CommandHit[]> {
  const placeholders = ids.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id, title, slug, status FROM pages
          WHERE tenant_id = 1 AND trashed_at IS NULL AND id IN (${placeholders})`,
    args: ids,
  });
  return r.rows.map((row) => {
    const id = Number(row.id);
    return {
      kind: "page" as const,
      id: String(id),
      title: String(row.title),
      subtitle: `/${String(row.slug)}`,
      href: `/admin/pages/${id}/edit`,
      badge: String(row.status) === "published" ? "Published" : "Draft",
    };
  });
}

async function hydrateTopics(ids: string[]): Promise<CommandHit[]> {
  const placeholders = ids.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id, name, slug, description, post_count FROM topics
          WHERE tenant_id = 1 AND id IN (${placeholders})`,
    args: ids,
  });
  return r.rows.map((row) => {
    const id = Number(row.id);
    const postCount = Number(row.post_count ?? 0);
    return {
      kind: "topic" as const,
      id: String(id),
      title: String(row.name),
      subtitle: row.description ? String(row.description) : `/${String(row.slug)}`,
      href: `/admin/topics`,
      badge: postCount > 0 ? `${postCount} ${postCount === 1 ? "post" : "posts"}` : null,
    };
  });
}

async function hydrateMedia(ids: string[]): Promise<CommandHit[]> {
  const placeholders = ids.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id, filename, mime, size_bytes FROM media
          WHERE tenant_id = 1 AND id IN (${placeholders})`,
    args: ids,
  });
  return r.rows.map((row) => {
    const id = String(row.id);
    const sizeKb = Math.round(Number(row.size_bytes ?? 0) / 1024);
    return {
      kind: "media" as const,
      id,
      title: String(row.filename),
      subtitle: String(row.mime),
      href: `/admin/media/${id}`,
      badge: `${sizeKb.toLocaleString()} KB`,
    };
  });
}
