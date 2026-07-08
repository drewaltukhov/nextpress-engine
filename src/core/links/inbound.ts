"use server";

import { db } from "@core/db/instance";
import { auth } from "@core/auth";
import { headers } from "next/headers";
import type { DbClient } from "@core/db/client";
import {
  collectHitsForSource,
  groupByPillar,
  resolveTargetUrl,
  walkContentJson,
  type InboundLink,
  type InboundLinkGroup,
  type InboundLinkSourceKind,
  type InboundPostKind,
} from "./inbound-utils";

// Re-export the public types so callers can import them from a single path.
export type {
  InboundLinkSourceKind,
  InboundHitKind,
  InboundPostKind,
  InboundLinkSource,
  InboundLink,
  InboundLinkGroup,
} from "./inbound-utils";

interface PageContentRow {
  id: number;
  title: string;
  slug: string;
  contentJson: string | null;
}

interface PostContentRow {
  id: number;
  title: string;
  slug: string;
  contentJson: string | null;
  postKind: InboundPostKind;
  parentId: number | null;
  parentSlug: string | null;
  parentTitle: string | null;
}

async function loadPublishedPagesWithContent(client: DbClient): Promise<PageContentRow[]> {
  const r = await client.execute({
    sql: `SELECT id, title, slug, content_json
          FROM pages
          WHERE tenant_id = 1 AND status = 'published' AND trashed_at IS NULL`,
    args: [],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    contentJson: row.content_json != null ? String(row.content_json) : null,
  }));
}

async function loadPublishedPostsWithContent(client: DbClient): Promise<PostContentRow[]> {
  const r = await client.execute({
    sql: `SELECT p.id, p.title, p.slug, p.content_json,
                 p.post_kind, p.parent_id,
                 parent.slug AS parent_slug, parent.title AS parent_title
          FROM posts p
          LEFT JOIN posts parent ON parent.id = p.parent_id
          WHERE p.tenant_id = 1 AND p.status = 'published' AND p.trashed_at IS NULL`,
    args: [],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    contentJson: row.content_json != null ? String(row.content_json) : null,
    postKind: String(row.post_kind) as InboundPostKind,
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    parentSlug: row.parent_slug != null ? String(row.parent_slug) : null,
    parentTitle: row.parent_title != null ? String(row.parent_title) : null,
  }));
}

function buildHits(counts: { richtext: number; cta: number }): InboundLink["hits"] {
  const hits: InboundLink["hits"] = [];
  if (counts.richtext > 0) hits.push({ kind: "richtext", count: counts.richtext });
  if (counts.cta > 0) hits.push({ kind: "cta", count: counts.cta });
  return hits;
}

/**
 * Lists every published post or page that links to the target via either a
 * RichText anchor or a structured CTA href, grouped by pillar. Admin-only —
 * returns [] when no session is present.
 */
export async function listInboundLinks(target: {
  kind: InboundLinkSourceKind;
  id: number;
}): Promise<InboundLinkGroup[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const client = db();
  const h = await headers();
  // Strip port — normalizeUrl compares against `URL.hostname` (no port).
  const originHost = (h.get("host") ?? "").split(":")[0];

  const [pages, posts] = await Promise.all([
    loadPublishedPagesWithContent(client),
    loadPublishedPostsWithContent(client),
  ]);

  let targetUrl: string;
  if (target.kind === "page") {
    const t = pages.find((p) => p.id === target.id);
    if (!t) return [];
    targetUrl = resolveTargetUrl({ kind: "page", slug: t.slug });
  } else {
    const t = posts.find((p) => p.id === target.id);
    if (!t) return [];
    targetUrl = resolveTargetUrl({
      kind: "post",
      slug: t.slug,
      postKind: t.postKind,
      parentSlug: t.parentSlug,
    });
  }

  const out: InboundLink[] = [];

  for (const p of pages) {
    if (target.kind === "page" && p.id === target.id) continue;
    if (!p.contentJson) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(p.contentJson);
    } catch {
      console.warn(`[backlinks] page ${p.id} has malformed contentJson — skipping`);
      continue;
    }
    const blocks = walkContentJson(parsed);
    const counts = collectHitsForSource(blocks, targetUrl, originHost);
    if (counts.richtext === 0 && counts.cta === 0) continue;
    out.push({
      source: { kind: "page", id: p.id, title: p.title, slug: p.slug },
      hits: buildHits(counts),
    });
  }

  for (const p of posts) {
    if (target.kind === "post" && p.id === target.id) continue;
    if (!p.contentJson) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(p.contentJson);
    } catch {
      console.warn(`[backlinks] post ${p.id} has malformed contentJson — skipping`);
      continue;
    }
    const blocks = walkContentJson(parsed);
    const counts = collectHitsForSource(blocks, targetUrl, originHost);
    if (counts.richtext === 0 && counts.cta === 0) continue;
    out.push({
      source: {
        kind: "post",
        id: p.id,
        title: p.title,
        slug: p.slug,
        postKind: p.postKind,
        parentId: p.parentId,
        parentSlug: p.parentSlug,
        parentTitle: p.parentTitle,
      },
      hits: buildHits(counts),
    });
  }

  return groupByPillar(out);
}
