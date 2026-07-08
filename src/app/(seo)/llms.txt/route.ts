import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { listPosts } from "@core-plugins/posts";
import { resolveSiteUrl } from "@core/site-url";

export const dynamic = "force-dynamic";

/** Number of recent posts to surface in the index. */
const RECENT_POSTS = 30;

// llms.txt — proposal at https://llmstxt.org. A curated, markdown-ish
// index for LLMs and AI agents: a short site summary, then sections
// listing the most useful URLs grouped by purpose. Keeps the agent
// from having to crawl the whole site to find the canonical entry
// points.
export async function GET() {
  const [
    siteUrl,
    siteTitle,
    siteTagline,
    defaultDescription,
    discourageAiAgents,
    discourageIndexing,
  ] = await Promise.all([
    resolveSiteUrl(db()),
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    getSetting<string>(db(), "seo.default_description"),
    getSetting<boolean>(db(), "seo.discourage_ai_agents"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
  ]);

  // llms.txt exists only to feed AI agents; suppress it when they're
  // discouraged — and when the whole site is hidden from crawlers, which
  // covers AI agents too (the admin UI promises exactly that). The 404 is
  // cached like the 200: this is the state bots hammer hardest.
  if (discourageAiAgents || discourageIndexing) {
    return new NextResponse("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  }

  const base = (siteUrl || "").replace(/\/$/, "");
  const title = siteTitle?.trim() || "NextPress";
  const tagline = siteTagline?.trim() || "";
  const summary = defaultDescription?.trim() || tagline;

  const posts = await listPosts(db(), { status: "published", view: "live" });
  const recent = posts
    .filter((p) => !!p.publishedAt)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, RECENT_POSTS);

  const sections: string[] = [
    `# ${title}`,
    "",
    tagline ? `> ${tagline}` : null,
    summary && summary !== tagline ? "" : null,
    summary && summary !== tagline ? summary : null,
    "",
    "## Discovery",
    "",
    `- [Sitemap](${base}/sitemap.xml): every canonical URL on the site, with last-modified timestamps.`,
    `- [RSS feed](${base}/rss.xml): the most recent posts in chronological order.`,
    `- [Robots](${base}/robots.txt): crawl policy.`,
    `- [Documentation](${base}/docs): user-facing docs for the NextPress engine itself.`,
    "",
    "## Recent posts",
    "",
    ...recent.map((p) => {
      const url =
        p.postKind === "spike" && p.parentSlug
          ? `${base}/${p.parentSlug}/${p.slug}`
          : `${base}/${p.slug}`;
      const desc = p.seoDescription?.trim();
      return `- [${p.title}](${url})${desc ? `: ${desc}` : ""}`;
    }),
    "",
    "## Search",
    "",
    `- [Site search](${base}/search?q={query}): full-text search across published posts and pages.`,
    "",
  ].filter((line): line is string => line !== null);

  return new NextResponse(sections.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
