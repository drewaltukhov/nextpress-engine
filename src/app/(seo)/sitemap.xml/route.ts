import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { generateSitemap, type SitemapUrl } from "@core-plugins/seo/generators";
import { listPages } from "@core-plugins/pages";
import { listPosts, listAuthors } from "@core-plugins/posts";
import { listTopics } from "@core-plugins/topics";
import { normalizeSlug } from "@core/slugs/normalize";
import { resolveSiteUrl } from "@core/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1 hour

interface SitemapInclude {
  homepage: boolean;
  posts: boolean;
  pages: boolean;
  topics: boolean;
  authors: boolean;
  media: boolean;
}

const DEFAULT_INCLUDE: SitemapInclude = {
  homepage: true,
  posts: true,
  pages: true,
  topics: true,
  authors: true,
  media: false,
};

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function GET() {
  const [siteUrl, sitemapEnabled, discourageIndexing, includeSetting, homePageId] =
    await Promise.all([
      resolveSiteUrl(db()),
      getSetting<boolean>(db(), "seo.sitemap_enabled"),
      getSetting<boolean>(db(), "seo.discourage_indexing"),
      getSetting<SitemapInclude>(db(), "seo.sitemap_include"),
      getSetting<number>(db(), "content.home_page_id"),
    ]);

  // Discouraged sites and explicit opt-out both 404 — search engines treat a
  // missing sitemap as "no map", not "an empty map".
  if (discourageIndexing || sitemapEnabled === false) {
    return new NextResponse("Not Found", { status: 404 });
  }
  // Merge with defaults so fields added later (e.g. `authors`) come up true
  // for installations whose stored value pre-dates them.
  const include: SitemapInclude = { ...DEFAULT_INCLUDE, ...(includeSetting ?? {}) };

  const urls: SitemapUrl[] = [];

  // Homepage. When a static page is configured, the homepage IS a Page
  // already included below — so we use that page's `updated_at` as the
  // homepage's lastmod and skip emitting it again under its slug. Avoids
  // duplicate <loc> entries pointing at effectively the same content
  // (only the canonical URL differs).
  let homepageHandledById: number | null = null;
  if (include.homepage) {
    const homePage =
      (homePageId ?? 0) > 0
        ? (await listPages(db(), { status: "published", view: "live" })).find(
            (p) => p.id === homePageId,
          )
        : undefined;
    urls.push({
      loc: siteUrl.replace(/\/$/, "") || "/",
      lastmod: toIsoDate(homePage?.updatedAt),
      changefreq: "weekly",
      priority: 1.0,
    });
    if (homePage) homepageHandledById = homePage.id;
  }

  if (include.pages) {
    const pages = await listPages(db(), { status: "published", view: "live" });
    for (const p of pages) {
      if (p.id === homepageHandledById) continue;
      // Per-row override: a published page with `seo_exclude_from_sitemap`
      // set drops out of /sitemap.xml regardless of the site-wide toggle.
      if (p.seoExcludeFromSitemap) continue;
      urls.push({
        loc: joinUrl(siteUrl, `/${p.slug}`),
        lastmod: toIsoDate(p.updatedAt) ?? toIsoDate(p.publishedAt),
        changefreq: "monthly",
        priority: 0.7,
      });
    }
  }

  if (include.posts) {
    const posts = await listPosts(db(), { status: "published", view: "live" });
    for (const p of posts) {
      // Per-row override: a published post with `seo_exclude_from_sitemap`
      // set drops out regardless of the site-wide toggle.
      if (p.seoExcludeFromSitemap) continue;
      // URL shape mirrors the public router:
      //   - pillars + standalone live at /<slug>
      //   - spikes live at /<pillar.slug>/<slug>; we drop spikes whose
      //     parent pillar isn't visible (parentSlug joined NULL means
      //     the pillar is missing or trashed) — listing them would emit
      //     a /<slug>/<spikeSlug> URL that 404s.
      let path: string;
      if (p.postKind === "spike") {
        if (!p.parentSlug) continue;
        path = `/${p.parentSlug}/${p.slug}`;
      } else {
        path = `/${p.slug}`;
      }
      urls.push({
        loc: joinUrl(siteUrl, path),
        lastmod: toIsoDate(p.updatedAt) ?? toIsoDate(p.publishedAt),
        // Pillars are higher-priority than spikes — they're the broad-
        // authority entry points. Standalone sit between (regular post
        // weight). Numbers below are the standard 0.6 / 0.7 / 0.8 split.
        changefreq: "weekly",
        priority: p.postKind === "pillar" ? 0.8 : p.postKind === "spike" ? 0.6 : 0.7,
      });
    }
  }

  if (include.topics) {
    const topics = await listTopics(db());
    for (const t of topics) {
      // Skip empty archives — Google won't reward "tag" pages with zero
      // posts, and emitting them risks soft-404s when the archive renders
      // a "no posts here yet" placeholder.
      if (t.postCount <= 0) continue;
      urls.push({
        loc: joinUrl(siteUrl, `/topics/${t.slug}`),
        lastmod: toIsoDate(t.updatedAt),
        changefreq: "weekly",
        priority: 0.5,
      });
    }
  }

  if (include.authors) {
    // Only authors with at least one live published post. Slug is the
    // normalized form of `displayName` — same derivation as the
    // `/author/<username>` route's resolver. Skip authors whose
    // displayName slugifies to empty (no usable URL).
    const authors = await listAuthors(db());
    const seen = new Set<string>();
    for (const a of authors) {
      if (a.postCount <= 0) continue;
      const slug = normalizeSlug(a.displayName);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      urls.push({
        loc: joinUrl(siteUrl, `/author/${slug}`),
        changefreq: "monthly",
        priority: 0.4,
      });
    }
  }

  // media stays queued until that archive route ships.

  const xml = generateSitemap(urls);

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
