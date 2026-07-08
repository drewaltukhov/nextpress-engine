import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { listPosts } from "@core-plugins/posts";
import { generateRssFeed, type RssItem } from "@core-plugins/seo/generators";
import { resolveSiteUrl } from "@core/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 minutes

/** Number of most-recent posts to include in the feed. */
const FEED_ITEMS = 20;

export async function GET() {
  const [siteUrl, siteTitle, siteTagline] = await Promise.all([
    resolveSiteUrl(db()),
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
  ]);

  // Published, non-trashed posts only. listPosts already orders by
  // updated_at DESC; we re-sort by publishedAt DESC for feed
  // semantics (subscribers care about publish recency, not edits).
  const posts = await listPosts(db(), { status: "published", view: "live" });
  const items: RssItem[] = posts
    .filter((p) => !!p.publishedAt)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, FEED_ITEMS)
    .map((p) => ({
      title: p.title,
      url: postPublicUrl(siteUrl, p),
      publishedAt: p.publishedAt!,
      description: p.seoDescription?.trim() || undefined,
      author: p.authorDisplayName?.trim() || undefined,
    }));

  const xml = generateRssFeed({
    siteUrl,
    siteTitle: siteTitle?.trim() || "NextPress",
    siteDescription: siteTagline?.trim() || undefined,
    items,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300",
    },
  });
}

/**
 * Build the public URL for a post: pillar/standalone live at /<slug>;
 * spike lives at /<parentSlug>/<slug>. Mirrors the route shape in
 * `src/app/[slug]/page.tsx` and `src/app/[slug]/[childSlug]/page.tsx`.
 */
function postPublicUrl(
  siteUrl: string,
  p: { slug: string; postKind: "standalone" | "pillar" | "spike"; parentSlug: string | null }
): string {
  if (p.postKind === "spike" && p.parentSlug) {
    return `${siteUrl}/${p.parentSlug}/${p.slug}`;
  }
  return `${siteUrl}/${p.slug}`;
}
