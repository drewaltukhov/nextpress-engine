/**
 * Topics service — flat-tag taxonomy CRUD.
 *
 * `post_count` is denormalized: the future Posts plugin maintains it on
 * assign/unassign. Today it stays at 0.
 *
 * Slugs are normalized via `normalizeSlug` and checked against the global
 * `reserved_slugs` registry (the same one user / page slugs use).
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { normalizeSlug } from "@core/slugs/normalize";
import { isSlugReserved } from "@core/slugs/registry";

const TOPICS_CACHE_TAG = "nextpress:topics";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

export function invalidateTopicsCache(): void {
  try {
    updateTag(TOPICS_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller relies on revalidate TTL
  }
}

export class TopicSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A topic with slug "${slug}" already exists`);
    this.name = "TopicSlugConflictError";
  }
}

export class TopicSlugReservedError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is reserved and can't be used as a topic`);
    this.name = "TopicSlugReservedError";
  }
}

export interface TopicListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
  createdAt: string;
  updatedAt: string;
  /** NULL = built-in Topic Archive. Otherwise the slug of a custom
   *  template (theme_data.parent_template = 'topic-archive'). */
  template: string | null;
}

export interface CreateTopicInput {
  name: string;
  slug?: string;
  description?: string | null;
  template?: string | null;
  createdBy?: string | null;
}

export interface UpdateTopicInput {
  name?: string;
  slug?: string;
  description?: string | null;
  template?: string | null;
}

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;
const MAX_SLUG = 100;

function rowToItem(row: Record<string, unknown>): TopicListItem {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description != null ? String(row.description) : null,
    postCount: Number(row.post_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    template: row.template != null ? String(row.template) : null,
  };
}

async function listTopicsRaw(db: DbClient): Promise<TopicListItem[]> {
  const r = await db.execute({
    sql: `SELECT id, name, slug, description, post_count, created_at, updated_at, template
          FROM topics
          WHERE tenant_id = 1
          ORDER BY name COLLATE NOCASE ASC`,
    args: [],
  });
  return r.rows.map(rowToItem);
}

const listTopicsCached = unstable_cache(
  (): Promise<TopicListItem[]> => listTopicsRaw(getRuntimeDb()),
  ["nextpress", "topics-list", "v1"],
  { tags: [TOPICS_CACHE_TAG], revalidate: 300 },
);

export async function listTopics(db: DbClient): Promise<TopicListItem[]> {
  return cacheOrFallback(() => listTopicsCached(), () => listTopicsRaw(db));
}

export async function getTopic(db: DbClient, id: number): Promise<TopicListItem | null> {
  const r = await db.execute({
    sql: `SELECT id, name, slug, description, post_count, created_at, updated_at, template
          FROM topics
          WHERE tenant_id = 1 AND id = ?
          LIMIT 1`,
    args: [id],
  });
  const row = r.rows[0];
  return row ? rowToItem(row) : null;
}

export async function getTopicBySlug(
  db: DbClient,
  slug: string,
): Promise<TopicListItem | null> {
  const r = await db.execute({
    sql: `SELECT id, name, slug, description, post_count, created_at, updated_at, template
          FROM topics
          WHERE tenant_id = 1 AND slug = ?
          LIMIT 1`,
    args: [slug],
  });
  const row = r.rows[0];
  return row ? rowToItem(row) : null;
}

async function slugExists(db: DbClient, slug: string, exceptId?: number): Promise<boolean> {
  const r = await db.execute({
    sql: exceptId
      ? "SELECT 1 FROM topics WHERE tenant_id = 1 AND slug = ? AND id != ? LIMIT 1"
      : "SELECT 1 FROM topics WHERE tenant_id = 1 AND slug = ? LIMIT 1",
    args: exceptId ? [slug, exceptId] : [slug],
  });
  return r.rows.length > 0;
}

export async function createTopic(db: DbClient, input: CreateTopicInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);

  const description = input.description?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION) {
    throw new Error(`Description must be at most ${MAX_DESCRIPTION} characters`);
  }

  const requestedSlug = input.slug?.trim() || name;
  const slug = normalizeSlug(requestedSlug);
  if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
  if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);
  if (await isSlugReserved(db, slug)) throw new TopicSlugReservedError(slug);
  if (await slugExists(db, slug)) throw new TopicSlugConflictError(slug);

  const template = normalizeTemplateInput(input.template);

  const r = await db.execute({
    sql: `INSERT INTO topics (tenant_id, name, slug, description, template, created_by)
          VALUES (1, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [name, slug, description, template, input.createdBy ?? null],
  });
  invalidateTopicsCache();
  return Number(r.rows[0]?.id);
}

/** Empty string or whitespace-only input means "use the built-in Topic
 *  Archive template" — store NULL. A real slug passes through verbatim;
 *  validating that the slug points to an existing custom row is left to
 *  the caller, since the renderer's `resolveTemplateData` already
 *  falls back gracefully when the row is missing. */
function normalizeTemplateInput(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function updateTopic(
  db: DbClient,
  id: number,
  input: UpdateTopicInput,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);
    sets.push("name = ?");
    args.push(name);
  }

  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
    if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);
    if (await isSlugReserved(db, slug)) throw new TopicSlugReservedError(slug);
    if (await slugExists(db, slug, id)) throw new TopicSlugConflictError(slug);
    sets.push("slug = ?");
    args.push(slug);
  }

  if (input.description !== undefined) {
    const description = input.description?.trim() || null;
    if (description && description.length > MAX_DESCRIPTION) {
      throw new Error(`Description must be at most ${MAX_DESCRIPTION} characters`);
    }
    sets.push("description = ?");
    args.push(description);
  }

  if (input.template !== undefined) {
    sets.push("template = ?");
    args.push(normalizeTemplateInput(input.template));
  }

  if (sets.length === 0) return;

  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE topics SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });
  invalidateTopicsCache();
}

export async function deleteTopic(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM topics WHERE tenant_id = 1 AND id = ?",
    args: [id],
  });
  invalidateTopicsCache();
}
