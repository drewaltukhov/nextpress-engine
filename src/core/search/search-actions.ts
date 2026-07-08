"use server";

import { db } from "@core/db/instance";

export interface SearchSnippet {
  /** Plain text immediately before the match (already trimmed to a
   *  reasonable window with a leading "…" when the source extends
   *  further left). */
  before: string;
  /** The matched substring, preserving the source's casing. */
  match: string;
  /** Plain text immediately after the match (with trailing "…" when
   *  trimmed). */
  after: string;
}

export interface SearchResultItem {
  /** Stable across reloads — `${kind}-${id}`. */
  key: string;
  kind: "page" | "post";
  id: number;
  title: string;
  /** Pre-built public path. Pages and root posts: `/<slug>`. Spike posts:
   *  `/<parentSlug>/<slug>` (or `/<slug>` when parent is missing). */
  url: string;
  /** Short excerpt for the result row. Pulled from the post/page's
   *  excerpt or SEO description; null when neither is set. */
  excerpt: string | null;
  /** Posts: their `featured_image` URL. Pages: always `null` — pages
   *  don't carry a featured image column today. */
  featuredImage: string | null;
  publishedAt: string | null;
  /** A short window of body text containing the matched query, suitable
   *  for `<mark>`-style highlighting. Null when the match was in the
   *  title or another non-snippetable field — the row falls back to the
   *  static `excerpt` in that case. */
  snippet: SearchSnippet | null;
}

interface PageRow {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  seo_description: string | null;
  content_json: string | null;
  // libSQL returns ISO strings; postgres-js returns Date for TIMESTAMPTZ.
  // Both pass through `toIsoString` before reaching SearchResultItem.
  published_at: string | Date | null;
}

interface PostRow {
  id: number;
  title: string;
  slug: string;
  post_kind: string;
  parent_slug: string | null;
  excerpt: string | null;
  seo_description: string | null;
  content_json: string | null;
  featured_image: string | null;
  // libSQL returns ISO strings; postgres-js returns Date for TIMESTAMPTZ.
  // Both pass through `toIsoString` before reaching SearchResultItem.
  published_at: string | Date | null;
}

/**
 * Public-site search over published pages and published posts. Matches
 * against:
 *   - title
 *   - SEO title + SEO description
 *   - excerpt (the user-authored summary)
 *   - content_json (the raw Puck JSON; matches body text inside the
 *     blocks, at the cost of occasional false positives on JSON keys).
 *
 * Empty / whitespace-only queries return []. The route layer paginates
 * the returned list in-memory.
 */
export async function searchPublishedContent(
  query: string,
): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  // SQLite LIKE wildcards: % and _. Escape both so a query like
  // "100%" doesn't blow up into a match-everything pattern.
  const term = `%${trimmed.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  // Six placeholders — one per searched column. Keep the column order
  // in sync between the SQL and the args array.
  const args = [term, term, term, term, term, term];

  const [pagesRes, postsRes] = await Promise.all([
    db().execute({
      sql: `SELECT p.id, p.title, p.slug, p.excerpt, p.seo_description, p.content_json, p.published_at
            FROM pages p
            WHERE p.tenant_id = 1
              AND p.trashed_at IS NULL
              AND p.status = 'published'
              AND (
                p.title LIKE ? ESCAPE '\\'
                OR p.seo_title LIKE ? ESCAPE '\\'
                OR p.seo_description LIKE ? ESCAPE '\\'
                OR p.excerpt LIKE ? ESCAPE '\\'
                OR p.content_json LIKE ? ESCAPE '\\'
                OR p.slug LIKE ? ESCAPE '\\'
              )
            ORDER BY p.published_at DESC, p.id DESC
            LIMIT 100`,
      args,
    }),
    db().execute({
      sql: `SELECT p.id, p.title, p.slug, p.post_kind, parent.slug AS parent_slug,
                   p.excerpt, p.seo_description, p.content_json, p.featured_image, p.published_at
            FROM posts p
            LEFT JOIN posts parent ON parent.id = p.parent_id
            WHERE p.tenant_id = 1
              AND p.trashed_at IS NULL
              AND p.status = 'published'
              AND (
                p.title LIKE ? ESCAPE '\\'
                OR p.seo_title LIKE ? ESCAPE '\\'
                OR p.seo_description LIKE ? ESCAPE '\\'
                OR p.excerpt LIKE ? ESCAPE '\\'
                OR p.content_json LIKE ? ESCAPE '\\'
                OR p.slug LIKE ? ESCAPE '\\'
              )
            ORDER BY p.published_at DESC, p.id DESC
            LIMIT 100`,
      args,
    }),
  ]);

  const pageHits: SearchResultItem[] = pagesRes.rows.map((raw) => {
    const row = raw as unknown as PageRow;
    return {
      key: `page-${row.id}`,
      kind: "page",
      id: row.id,
      title: String(row.title),
      url: `/${row.slug}`,
      excerpt: row.excerpt ?? row.seo_description ?? null,
      featuredImage: null,
      publishedAt: toIsoString(row.published_at),
      snippet: buildSnippet(trimmed, [
        row.excerpt,
        row.seo_description,
        extractPuckText(row.content_json),
      ]),
    };
  });

  const postHits: SearchResultItem[] = postsRes.rows.map((raw) => {
    const row = raw as unknown as PostRow;
    const url =
      row.post_kind === "spike" && row.parent_slug
        ? `/${row.parent_slug}/${row.slug}`
        : `/${row.slug}`;
    return {
      key: `post-${row.id}`,
      kind: "post",
      id: row.id,
      title: String(row.title),
      url,
      excerpt: row.excerpt ?? row.seo_description ?? null,
      featuredImage: row.featured_image ?? null,
      publishedAt: toIsoString(row.published_at),
      snippet: buildSnippet(trimmed, [
        row.excerpt,
        row.seo_description,
        extractPuckText(row.content_json),
      ]),
    };
  });

  // Merge newest-first across both kinds. Items without a publishedAt
  // sort last.
  const merged = [...pageHits, ...postHits];
  merged.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return merged;
}

/**
 * Normalise a timestamp column to an ISO string. libSQL returns these as
 * strings already; postgres-js returns TIMESTAMPTZ as Date objects, which
 * break string-only consumers like `.localeCompare(...)`.
 */
function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// Puck-block fields that carry user-authored prose. Anything else
// (UUIDs, prop ids, layout enums) is skipped during text extraction.
const TEXTUAL_KEYS = new Set([
  "text",
  "html",
  "headline",
  "subheadline",
  "title",
  "caption",
  "question",
  "answer",
  "description",
  "body",
  "ctaText",
  "placeholder",
  "label",
  "alt",
  "imageAlt",
]);

/**
 * Pull a single plain-text blob out of a Puck `content_json` payload —
 * used to build search snippets without dragging the full Puck render
 * pipeline server-side. Walks the parsed JSON, harvests strings stored
 * under known prose keys, strips HTML tags from any `html` fields, and
 * collapses whitespace. Returns "" on parse failure or null input — the
 * snippet builder handles empty haystacks gracefully.
 */
function extractPuckText(json: string | null): string {
  if (!json) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return "";
  }
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === "string") {
        if (TEXTUAL_KEYS.has(key)) {
          const cleaned = key === "html" ? stripHtml(value) : value;
          if (cleaned.trim().length > 0) out.push(cleaned);
        }
      } else if (typeof value === "object" && value !== null) {
        walk(value);
      }
    }
  };
  walk(parsed);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

const SNIPPET_WINDOW = 80;

/**
 * Find the first occurrence of `query` (case-insensitive) anywhere in
 * the supplied text candidates and return a `{ before, match, after }`
 * window suitable for `<mark>` highlighting. Candidates are tried in
 * order — the first one that matches wins, so callers should pass
 * highest-signal sources first (excerpt → SEO → body).
 */
function buildSnippet(query: string, candidates: Array<string | null>): SearchSnippet | null {
  const needle = query.toLowerCase();
  for (const raw of candidates) {
    if (!raw) continue;
    const haystack = raw.replace(/\s+/g, " ").trim();
    const idx = haystack.toLowerCase().indexOf(needle);
    if (idx < 0) continue;
    const start = Math.max(0, idx - SNIPPET_WINDOW);
    const end = Math.min(haystack.length, idx + needle.length + SNIPPET_WINDOW);
    let before = haystack.slice(start, idx);
    let after = haystack.slice(idx + needle.length, end);
    // Trim partial words at the boundaries so the snippet doesn't
    // start mid-word — only when we actually clipped the source.
    if (start > 0) {
      const space = before.indexOf(" ");
      before = (space >= 0 ? before.slice(space + 1) : before);
      before = `…${before}`;
    }
    if (end < haystack.length) {
      const space = after.lastIndexOf(" ");
      after = (space >= 0 ? after.slice(0, space) : after);
      after = `${after}…`;
    }
    return {
      before,
      match: haystack.slice(idx, idx + needle.length),
      after,
    };
  }
  return null;
}
