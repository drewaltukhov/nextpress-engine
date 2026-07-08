"use server";

import { db } from "@core/db/instance";
import { auth } from "@core/auth";
import { listPages } from "@core-plugins/pages";
import { listPosts } from "@core-plugins/posts";
import { listTopics } from "@core-plugins/topics";

export interface PageLinkOption {
  id: number;
  title: string;
  slug: string;
}

/**
 * Lightweight read-only listing of published pages for the RichText link
 * picker. Only requires an authenticated session — any logged-in author
 * can link to any published page (they're public anyway). Returns up to
 * 20 hits filtered by title / SEO title / slug substring.
 */
export async function searchPagesForLink(query: string): Promise<PageLinkOption[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = await listPages(db(), {
    status: "published",
    search: query.trim() || undefined,
  });

  return rows.slice(0, 20).map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
  }));
}

export type ContentLinkKind = "page" | "post" | "topic";
export type ContentLinkPostKind = "standalone" | "pillar" | "spike";

export interface ContentLinkOption {
  /** Stable across reloads — `${kind}-${id}`. */
  key: string;
  kind: ContentLinkKind;
  /** Only set when `kind === "post"` — drives the Pillar / Spike badge. */
  postKind?: ContentLinkPostKind;
  id: number;
  title: string;
  /** Pre-built public path. Pages and root posts: `/<slug>`. Spike posts:
   *  `/<parentSlug>/<slug>` (or `/<slug>` when parent is missing). Topics:
   *  `/topics/<slug>`. */
  url: string;
  /** Parent pillar title for spike posts; null for everything else. Helps
   *  the dialog disambiguate two spikes that share a title under different
   *  pillars. */
  parentTitle: string | null;
}

/**
 * Unified picker source for the Hero CTA (and any future block that wants
 * "link to a page, post, or topic"). Returns up to ~30 hits — 12 pages +
 * 12 posts + 6 topics — filtered by the same search semantics as the
 * admin lists. Topics are filtered in-memory because `listTopics` has no
 * server-side search yet.
 *
 * Auth-gated to any signed-in user since the targets are public-by-definition.
 */
export async function searchContentForLink(query: string): Promise<ContentLinkOption[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const trimmed = query.trim();
  const search = trimmed.length > 0 ? trimmed : undefined;
  const lowered = trimmed.toLowerCase();

  const [pages, posts, topics] = await Promise.all([
    listPages(db(), { status: "published", search }),
    listPosts(db(), { status: "published", search }),
    listTopics(db()),
  ]);

  const pageHits: ContentLinkOption[] = pages.slice(0, 12).map((p) => ({
    key: `page-${p.id}`,
    kind: "page",
    id: p.id,
    title: p.title,
    url: `/${p.slug}`,
    parentTitle: null,
  }));

  const postHits: ContentLinkOption[] = posts.slice(0, 12).map((p) => {
    // Spike posts route at /<pillar>/<spike>. If parentSlug is missing
    // (orphaned spike, or kind = pillar/standalone), fall back to /<slug>.
    const url =
      p.postKind === "spike" && p.parentSlug
        ? `/${p.parentSlug}/${p.slug}`
        : `/${p.slug}`;
    return {
      key: `post-${p.id}`,
      kind: "post",
      postKind: p.postKind,
      id: p.id,
      title: p.title,
      url,
      parentTitle: p.postKind === "spike" ? p.parentTitle : null,
    };
  });

  const topicHits: ContentLinkOption[] = topics
    .filter((t) =>
      lowered.length === 0
        ? true
        : t.name.toLowerCase().includes(lowered) || t.slug.toLowerCase().includes(lowered),
    )
    .slice(0, 6)
    .map((t) => ({
      key: `topic-${t.id}`,
      kind: "topic",
      id: t.id,
      title: t.name,
      url: `/topics/${t.slug}`,
      parentTitle: null,
    }));

  return [...pageHits, ...postHits, ...topicHits];
}
