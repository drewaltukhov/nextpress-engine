import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { listPosts, type PostListItem } from "@core-plugins/posts/service";
import { getTopicBySlug } from "@core-plugins/topics";
import { parseNewspaperQuery } from "./parse-query";
import type { NewspaperPost } from "@core-plugins/site-widgets/newspaper/types";

/** Resolve multiple topic slugs to their IDs in a single round-trip. */
async function loadTopicIdsBySlugs(slugs: string[]): Promise<number[]> {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id FROM topics WHERE tenant_id = 1 AND slug IN (${placeholders})`,
    args: slugs,
  });
  return r.rows.map((row) => Number(row.id));
}

/**
 * Derive the public URL for a post.
 * Mirrors the private `postUrl` helper in themes/render.tsx — not exported
 * from the posts service, so we keep a copy here.
 */
function buildPostUrl(p: PostListItem): string {
  if (p.postKind === "spike" && p.parentSlug) return `/${p.parentSlug}/${p.slug}`;
  return `/${p.slug}`;
}

interface FirstTopicRow {
  post_id: number;
  topic_id: number;
  topic_name: string;
  topic_slug: string;
}

async function loadFirstTopicByPost(
  postIds: number[],
): Promise<Map<number, NewspaperPost["topic"]>> {
  const map = new Map<number, NewspaperPost["topic"]>();
  if (postIds.length === 0) return map;
  const placeholders = postIds.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT pt.post_id, t.id AS topic_id, t.name AS topic_name, t.slug AS topic_slug
            FROM posts_topics pt
            INNER JOIN topics t ON t.id = pt.topic_id
            WHERE pt.post_id IN (${placeholders})
            ORDER BY t.name ASC`,
    args: postIds,
  });
  for (const row of r.rows as unknown as FirstTopicRow[]) {
    if (!map.has(Number(row.post_id))) {
      map.set(Number(row.post_id), {
        id: Number(row.topic_id),
        name: String(row.topic_name),
        slug: String(row.topic_slug),
      });
    }
  }
  return map;
}

export async function handleNewspaperPostsRequest(url: URL): Promise<Response> {
  const parsed = parseNewspaperQuery(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const q = parsed.value;

  let topicIds: number[] | undefined;
  let pillarIds: number[] | undefined;

  if (q.kind === "single") {
    if (q.type === "pillar") {
      pillarIds = [Number.parseInt(q.key, 10)];
    } else {
      const topic = await getTopicBySlug(db(), q.key);
      if (!topic) {
        return NextResponse.json({ error: "topic not found" }, { status: 404 });
      }
      topicIds = [topic.id];
    }
  } else {
    if (q.allType === "pillar") {
      // Empty keys = "all spikes, no pillar narrowing" sentinel from
      // the Newspaper picker's "all checked" state. Leave pillarIds
      // undefined so the listPosts query stays unfiltered; the
      // `kind: "spike"` filter is still applied below so the feed
      // remains spike-only (matches what the SSR fetcher does).
      if (q.keys.length > 0) {
        pillarIds = q.keys.map((k) => Number.parseInt(k, 10));
      }
    } else {
      // Empty keys = "all topic-tagged posts" — leave topicIds
      // undefined so no narrowing is applied. Non-empty keys still
      // resolve slugs to ids and 404 if NONE match (user typo'd or
      // referenced a deleted topic).
      if (q.keys.length > 0) {
        const ids = await loadTopicIdsBySlugs(q.keys);
        if (ids.length === 0) {
          return NextResponse.json({ error: "no matching topics" }, { status: 404 });
        }
        topicIds = ids;
      }
    }
  }

  // The "kind: spike" filter rides with the pillar path AND with the
  // empty-pillar sentinel (no specific pillarIds, but we still want
  // spikes only — that's what "all spikes" means).
  const applySpikeKind =
    (q.kind === "single" && q.type === "pillar") ||
    (q.kind === "all" && q.allType === "pillar");
  const rows = await listPosts(db(), {
    status: "published",
    sort: "published_at",
    ...(applySpikeKind ? { kind: "spike" as const } : {}),
    ...(pillarIds ? { pillarIds } : {}),
    ...(topicIds ? { topicIds } : {}),
  });
  // listPosts doesn't accept limit/offset today, so we slice in app code.
  // For newspaper widget topics (typically ≤200 posts) this is acceptable;
  // revisit if a topic grows large enough that the unfiltered fetch becomes
  // a hotpath. Tracking issue: extend ListPostsFilters with limit/offset.
  const sliced = rows.slice(q.offset, q.offset + q.limit);

  const ids = sliced.map((p) => p.id);
  const topicMap = await loadFirstTopicByPost(ids);

  const posts: NewspaperPost[] = sliced.map((p) => ({
    id: p.id,
    title: p.title,
    url: buildPostUrl(p),
    featuredImage: p.featuredImage,
    publishedAt: p.publishedAt,
    excerpt: p.excerpt ?? p.seoDescription,
    topic: topicMap.get(p.id) ?? null,
    authorName: p.authorDisplayName ?? null,
  }));

  const cacheControl =
    posts.length > 0
      ? "public, max-age=60, s-maxage=300, stale-while-revalidate=300"
      : "no-store";

  return NextResponse.json({ posts }, { headers: { "Cache-Control": cacheControl } });
}
