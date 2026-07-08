/**
 * Shared public renderer for a published Page. Used by both the canonical
 * `/[slug]` route and the homepage (`/`) when `content.home_page_id` points
 * at a published page.
 *
 * The wrapper (`<main>` + `<article class="prose ...">`) lives here so the
 * two callers can't drift on padding, max-width, or typography. Metadata
 * (`generateMetadata`) stays per-route since canonical URLs differ — the
 * homepage canonical is the bare site URL, the slug page's is `/<slug>`.
 */
import type { ReactNode } from "react";
import { Render, type Data } from "@measured/puck";
import { db } from "@core/db/instance";
import { puckConfig } from "@core-plugins/pages/blocks";
import {
  collectFaqItems,
  collectGalleryIds,
  collectShortcodeMediaIds,
} from "@core-plugins/pages/blocks";
import { getGallery, type GalleryDetail } from "@core-plugins/galleries";
import { getMediaById, type MediaSummary } from "@core-plugins/media/service";
import {
  collectMenuLocations,
  getMenuByLocation,
  type MenuItemDetail,
} from "@core-plugins/menus";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveSiteUrl } from "@core/site-url";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
} from "@core/datetime";
import {
  collectNewspaperSpecs,
  collectNewspaperLabelKeys,
  fetchNewspaperData,
  fetchPillarsById,
  fetchTopicsBySlug,
} from "@core-plugins/themes/render";
import type { NewspaperPost } from "@core-plugins/site-widgets/newspaper/types";
import {
  wrapJsonLdGraph,
  articleJsonLd,
  faqPageJsonLd,
  breadcrumbJsonLd,
} from "@core-plugins/seo/metadata";
import { UnthemedShell } from "@core/components/UnthemedShell";
import type { PageDetail } from "./service";

export interface PublishedPageSeo {
  siteTitle: string;
  siteUrl: string;
  defaultOgImage: string;
  discourageIndexing: boolean;
}

export function parsePuckData(json: string | null): Data {
  if (!json) return { content: [], root: {} };
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return parsed as Data;
    }
  } catch {
    // Malformed — fall through to empty doc.
  }
  return { content: [], root: {} };
}

export interface BuildPageJsonLdArgs {
  page: PageDetail;
  seo: PublishedPageSeo;
  canonical: string;
  data: Data;
  /** When true, emit a 2-step BreadcrumbList (Home → page). Skipped on the
   *  homepage variant where `canonical === siteUrl` — only one step,
   *  redundant. */
  breadcrumbEnabled: boolean;
}

/**
 * Build the array of per-page JSON-LD nodes for a Page. Single source of
 * truth for what `<script type="application/ld+json">` would emit on the
 * public render — also called by the admin schema-checkup preview so the
 * dialog reflects exactly what crawlers see.
 *
 * Returns an empty array when the page is set to noindex or the site is
 * indexing-discouraged (matches `PageJsonLd`'s null-render).
 */
export function buildPageJsonLdNodes({
  page,
  seo,
  canonical,
  data,
  breadcrumbEnabled,
}: BuildPageJsonLdArgs): object[] {
  if (seo.discourageIndexing || page.seoRobots.startsWith("noindex")) return [];

  const nodes: object[] = [];

  // FAQPage is auto-emitted from FAQSection blocks present in the page's
  // Puck content. No site-level toggle — if the author dropped FAQ blocks,
  // they want the schema. If the author also picks FAQPage in the Schemas
  // card, the auto-emitter still wins so we don't emit a duplicate node.
  const faqNode = faqPageJsonLd(collectFaqItems(data.content ?? []));
  if (faqNode) nodes.push(faqNode);

  // Search-facing label. When the author has set an explicit SEO title,
  // honor it everywhere a search-result-adjacent label appears (breadcrumb
  // current-page entry, Article.headline). Falls back to the display
  // title when no SEO override exists. Mirrors the pattern in
  // [slug]/page.tsx's `generateMetadata`.
  const seoLabel = page.seoTitle?.trim() || page.title;

  // Breadcrumb is the only auto-emitted nav-shape JSON-LD for Pages.
  // Trim the trailing slash on `canonical` for the comparison so
  // `https://x.com` and `https://x.com/` collapse to the same homepage.
  const trimmedCanonical = canonical.replace(/\/$/, "");
  const trimmedSiteUrl = seo.siteUrl.replace(/\/$/, "");
  const isHomepage = !!trimmedSiteUrl && trimmedCanonical === trimmedSiteUrl;
  if (breadcrumbEnabled && !isHomepage && trimmedSiteUrl) {
    nodes.push(
      breadcrumbJsonLd([
        { name: seo.siteTitle || "Home", url: trimmedSiteUrl },
        { name: seoLabel, url: canonical },
      ]),
    );
  }

  // FAQPage may have already been auto-emitted from FAQ blocks above; skip
  // re-emitting it from the schema_types loop in that case.
  const alreadyEmitted = new Set<string>();
  for (const node of nodes) {
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") alreadyEmitted.add(t);
  }

  // Description fallback for JSON-LD — same precedence as the
  // <meta name="description"> in route generateMetadata: explicit SEO
  // description, then excerpt, then nothing.
  const jsonLdDescription = page.seoDescription?.trim() || page.excerpt?.trim() || undefined;
  const jsonLdImage = page.seoOgImage?.trim() || seo.defaultOgImage || undefined;

  for (const type of page.schemaTypes) {
    if (alreadyEmitted.has(type)) continue;
    if (type === "Article" || type === "BlogPosting" || type === "NewsArticle") {
      nodes.push({
        ...articleJsonLd({
          headline: seoLabel,
          url: canonical,
          datePublished: page.publishedAt ?? page.createdAt,
          dateModified: page.updatedAt,
          author: page.authorDisplayName ? { name: page.authorDisplayName } : undefined,
          description: jsonLdDescription,
          image: jsonLdImage,
          siteUrl: seo.siteUrl,
        }),
        "@type": type,
      });
      alreadyEmitted.add(type);
      continue;
    }
    // Generic JSON-LD for every other schema type the author has selected.
    nodes.push({
      "@context": "https://schema.org",
      "@type": type,
      name: seoLabel,
      url: canonical,
      ...(jsonLdDescription ? { description: jsonLdDescription } : {}),
      ...(jsonLdImage ? { image: jsonLdImage } : {}),
      ...(page.publishedAt ? { datePublished: page.publishedAt } : {}),
      ...(page.updatedAt ? { dateModified: page.updatedAt } : {}),
      ...(page.authorDisplayName
        ? { author: { "@type": "Person", name: page.authorDisplayName } }
        : {}),
    });
    alreadyEmitted.add(type);
  }

  // Default fallback: every published page gets a `WebPage` node when the
  // author hasn't picked a more specific schema (Article, FAQPage, etc.).
  // Keeps generic content pages indexable by search engines with clean
  // structured data — picked up by the Breadcrumb's referencing page id
  // and by Google's "About this result" surfaces.
  if (!alreadyEmitted.has("WebPage") && !alreadyEmitted.has("Article") && !alreadyEmitted.has("BlogPosting") && !alreadyEmitted.has("NewsArticle")) {
    nodes.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": canonical,
      name: seoLabel,
      url: canonical,
      ...(jsonLdDescription ? { description: jsonLdDescription } : {}),
      ...(jsonLdImage ? { image: jsonLdImage } : {}),
      ...(page.publishedAt ? { datePublished: page.publishedAt } : {}),
      ...(page.updatedAt ? { dateModified: page.updatedAt } : {}),
    });
  }

  return nodes;
}

export function PageJsonLd(args: BuildPageJsonLdArgs): ReactNode {
  const nodes = buildPageJsonLdNodes(args);
  if (nodes.length === 0) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(wrapJsonLdGraph(nodes)) }}
    />
  );
}

export interface PageRenderInputs {
  data: Data;
  galleries: Record<number, GalleryDetail>;
  media: Record<string, MediaSummary>;
  menus: Record<string, { items: MenuItemDetail[] }>;
  /** Site identity tokens — exposed to in-body widgets (Text,
   *  ProductRating, …) so their shortcode resolution matches what
   *  `renderActiveTheme` provides at the theme level. */
  site: { title: string; tagline: string; url: string };
  /** The page being rendered — exposed for in-body widgets that need
   *  page context (e.g. JSON-LD itemReviewed.name). */
  page: PageDetail;
  /** Newspaper widget pre-fetch — keyed by cache key (same shape the
   *  theme renderer uses). Empty when the page body has no Newspaper
   *  blocks; otherwise carries each block's tab data. */
  newspaper: Record<string, NewspaperPost[]>;
  /** Pillar id → title map, for resolving Newspaper widget tab labels
   *  on the public render. Empty if no Newspaper widgets reference
   *  pillars by id. */
  pillarsById: Record<number, { id: number; title: string }>;
  /** Topic slug → details map, for resolving Newspaper widget tab
   *  labels. Empty if no Newspaper widgets reference topics by slug. */
  topicsBySlug: Record<string, { id: number; name: string; slug: string }>;
  /** Date format + timezone used by Newspaper widget client mounters
   *  for date label re-rendering on arrow/tab swaps. */
  display: { dateFormat: DateFormat; timezone: string };
}

/**
 * Pre-fetch every cross-cutting reference (galleries, shortcode media,
 * menu locations) referenced by a page's Puck content and return the
 * material the renderer needs. Called by both the legacy shell and the
 * active-theme renderer.
 */
export async function buildPageRenderInputs(page: PageDetail): Promise<PageRenderInputs> {
  const data = parsePuckData(page.contentJson);

  const [siteTitleRaw, siteTaglineRaw, siteUrlResolved, displayDateFormat, displayTimezone] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
    getSetting<DateFormat>(db(), "site.date_format"),
    getSetting<string>(db(), "site.timezone"),
  ]);
  const site = {
    title: typeof siteTitleRaw === "string" ? siteTitleRaw : "",
    tagline: typeof siteTaglineRaw === "string" ? siteTaglineRaw : "",
    url: siteUrlResolved,
  };
  const display = {
    dateFormat: displayDateFormat ?? DEFAULT_DATE_FORMAT,
    timezone: typeof displayTimezone === "string" && displayTimezone ? displayTimezone : DEFAULT_TIMEZONE,
  };

  // Newspaper widget pre-fetch — walks the page's Puck tree. Returns
  // empty maps when no Newspaper blocks are present (zero DB cost).
  const newspaperSpecs = collectNewspaperSpecs([data]);
  const labelKeys = collectNewspaperLabelKeys([data]);
  const [newspaper, pillarsById, topicsBySlug] = await Promise.all([
    fetchNewspaperData(newspaperSpecs),
    fetchPillarsById(Array.from(labelKeys.pillarIds)),
    fetchTopicsBySlug(Array.from(labelKeys.topicSlugs)),
  ]);

  const galleryIds = collectGalleryIds(data.content ?? []);
  const galleries: Record<number, GalleryDetail> = {};
  if (galleryIds.length > 0) {
    const fetched = await Promise.all(galleryIds.map((id) => getGallery(db(), id)));
    galleryIds.forEach((id, i) => {
      const detail = fetched[i];
      if (detail) galleries[id] = detail;
    });
  }

  const shortcodeMediaIds = collectShortcodeMediaIds(data.content ?? []);
  const media: Record<string, MediaSummary> = {};
  if (shortcodeMediaIds.length > 0) {
    const fetched = await Promise.all(
      shortcodeMediaIds.map((id) => getMediaById(db(), id)),
    );
    shortcodeMediaIds.forEach((id, i) => {
      const summary = fetched[i];
      if (summary) media[id] = summary;
    });
  }

  const menuLocations = collectMenuLocations(data.content ?? []);
  const menus: Record<string, { items: MenuItemDetail[] }> = {};
  if (menuLocations.length > 0) {
    const fetched = await Promise.all(
      menuLocations.map((loc) => getMenuByLocation(db(), loc)),
    );
    menuLocations.forEach((loc, i) => {
      const detail = fetched[i];
      if (detail) menus[loc] = { items: detail.items };
    });
  }

  return { data, galleries, media, menus, site, page, newspaper, pillarsById, topicsBySlug, display };
}

/**
 * Render a page's authored Puck content as a ReactNode (no `<main>` /
 * `<article>` wrapping). The active-theme renderer stuffs this into
 * `metadata.pageBody` so the theme's `PageContent` block can drop it
 * into the Single Page template's main zone. The legacy shell wraps it
 * in `<main>` + `<article>` itself.
 */
export function renderPageBodyContent(inputs: PageRenderInputs): ReactNode {
  const { data, galleries, media, menus, site, page, newspaper, pillarsById, topicsBySlug, display } = inputs;
  return (
    <Render
      config={puckConfig}
      data={data}
      metadata={{ galleries, media, menus, site, page, newspaper, pillarsById, topicsBySlug, display }}
    />
  );
}

export interface RenderPublishedPageArgs {
  page: PageDetail;
  seo: PublishedPageSeo;
  /** Absolute URL used for JSON-LD `url`. Site URL for `/`, site URL + slug for `/<slug>`. */
  canonical: string;
}

export async function renderPublishedPage({
  page,
  seo,
  canonical,
}: RenderPublishedPageArgs): Promise<ReactNode> {
  const breadcrumbEnabled =
    (await getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled")) ?? true;
  const inputs = await buildPageRenderInputs(page);

  return (
    <>
      <UnthemedShell title={page.title}>{renderPageBodyContent(inputs)}</UnthemedShell>
      <PageJsonLd
        page={page}
        seo={seo}
        canonical={canonical}
        data={inputs.data}
        breadcrumbEnabled={breadcrumbEnabled}
      />
    </>
  );
}
