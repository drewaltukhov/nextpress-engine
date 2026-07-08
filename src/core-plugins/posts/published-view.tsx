/**
 * Shared public renderer for a published Post. Used by:
 *
 *   - `/[slug]` for pillars + standalone posts (after the pages resolver
 *     has 404'd — pages take precedence so existing static-page slugs
 *     don't shift meaning when this plugin lands).
 *   - `/[pillarSlug]/[childSlug]` for spikes nested under a pillar.
 *
 * The wrapper (`<main>` + `<article class="prose ...">`) and the JSON-LD
 * builder live here so all callers stay consistent. Shape mirrors the
 * Pages renderer (`@core-plugins/pages/published-view`) — same Puck
 * `Render`, same gallery/media-shortcode parallel batch, same
 * suppression rules — with three additions specific to Posts:
 *
 *   1. Featured image becomes the og:image fallback at the metadata
 *      layer (handled in the route file, not here).
 *   2. BreadcrumbList for spikes is 3 steps: Home → Pillar → Spike.
 *   3. Article JSON-LD adds `articleBody` and `image` from the post's
 *      featured_image (resolved to absolute URL).
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
import { toFeaturedThumbVariant } from "@core-plugins/media/storage/url";
import { getSetting } from "@core-plugins/settings/registry";
import {
  collectNewspaperSpecs,
  collectNewspaperLabelKeys,
  fetchNewspaperData,
  fetchPillarsById,
  fetchTopicsBySlug,
} from "@core-plugins/themes/render";
import type { NewspaperPost } from "@core-plugins/site-widgets/newspaper/types";
import {
  collectMenuLocations,
  getMenuByLocation,
  type MenuItemDetail,
} from "@core-plugins/menus";
import {
  wrapJsonLdGraph,
  articleJsonLd,
  faqPageJsonLd,
  breadcrumbJsonLd,
} from "@core-plugins/seo/metadata";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  formatDate,
  parseSqliteUtc,
  type DateFormat,
} from "@core/datetime";
import { UnthemedShell } from "@core/components/UnthemedShell";
import { getBootBus } from "@core/boot";
import type { PostDetail } from "./service";
import type { JsonLdNode } from "./jsonld-types";
import "./jsonld-types"; // ensure FilterMap declaration is visible

export interface PublishedPostSeo {
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

export interface BuildPostJsonLdArgs {
  post: PostDetail;
  seo: PublishedPostSeo;
  canonical: string;
  data: Data;
  /** When true, emit BreadcrumbList. Site-wide toggle from the SEO admin. */
  breadcrumbEnabled: boolean;
  /**
   * When false, Article / BlogPosting / NewsArticle nodes are skipped
   * even if the author selected them in the post's Schema Types. Other
   * schema types (Recipe, HowTo, etc.) still emit. Site-wide toggle
   * from `seo.schema_article_enabled`.
   */
  articleEnabled: boolean;
}

const ARTICLE_FAMILY_TYPES = new Set(["Article", "BlogPosting", "NewsArticle"]);

/**
 * Build the array of JSON-LD nodes for a Post. Single source of truth so
 * the public render and the (future) admin Schema Checkup tab stay in
 * lockstep. Returns an empty array when the post or site is set to
 * noindex.
 */
export function buildPostJsonLdNodes({
  post,
  seo,
  canonical,
  data,
  breadcrumbEnabled,
  articleEnabled,
}: BuildPostJsonLdArgs): object[] {
  if (seo.discourageIndexing || post.seoRobots.startsWith("noindex")) return [];

  const nodes: object[] = [];

  // FAQPage auto-emit from FAQ blocks present in the post body — same
  // rule the pages renderer follows. Authors don't need a checkbox.
  const faqNode = faqPageJsonLd(collectFaqItems(data.content ?? []));
  if (faqNode) nodes.push(faqNode);

  // Search-facing label: honor the explicit SEO title if set.
  const seoLabel = post.seoTitle?.trim() || post.title;

  // BreadcrumbList shape:
  //   - Pillar / standalone:   Home → <self>
  //   - Spike:                 Home → Pillar → <self>
  // We only emit when there's at least one intermediate step (≥2 items
  // total, per Google's BreadcrumbList rule).
  const trimmedSiteUrl = seo.siteUrl.replace(/\/$/, "");
  if (breadcrumbEnabled && trimmedSiteUrl) {
    const items = [{ name: seo.siteTitle || "Home", url: trimmedSiteUrl }];
    if (post.postKind === "spike" && post.parentSlug && post.parentTitle) {
      items.push({
        name: post.parentTitle,
        url: `${trimmedSiteUrl}/${post.parentSlug}`,
      });
    }
    items.push({ name: seoLabel, url: canonical });
    nodes.push(breadcrumbJsonLd(items));
  }

  // FAQPage may have already been auto-emitted from FAQ blocks above; skip
  // re-emitting it from the schema_types loop in that case.
  const alreadyEmitted = new Set<string>();
  for (const node of nodes) {
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") alreadyEmitted.add(t);
  }

  // Description fallback for JSON-LD nodes — same precedence as the
  // <meta name="description"> in route generateMetadata: explicit SEO
  // description, then excerpt, then nothing.
  const jsonLdDescription = post.seoDescription?.trim() || post.excerpt?.trim() || undefined;
  const jsonLdImage =
    post.featuredImage?.trim() || post.seoOgImage?.trim() || seo.defaultOgImage || undefined;

  for (const type of post.schemaTypes) {
    if (alreadyEmitted.has(type)) continue;
    // Article-family is gated by the site-wide schema_article_enabled
    // toggle. Authors who don't want any Article JSON-LD on the site
    // can flip it off without editing every post's schema selection.
    if (ARTICLE_FAMILY_TYPES.has(type) && !articleEnabled) continue;
    if (ARTICLE_FAMILY_TYPES.has(type)) {
      // Article-family — featured image takes priority over the OG override
      // since it represents the post's primary visual.
      nodes.push({
        ...articleJsonLd({
          headline: seoLabel,
          url: canonical,
          datePublished: post.publishedAt ?? post.createdAt,
          dateModified: post.updatedAt,
          author: post.authorDisplayName ? { name: post.authorDisplayName } : undefined,
          description: jsonLdDescription,
          image: jsonLdImage,
          siteUrl: seo.siteUrl,
        }),
        // Override the @type since articleJsonLd hardcodes "Article". For
        // BlogPosting / NewsArticle we want the more specific tag so the
        // rich-results validator picks the right rendering. Spread order
        // matters — @type on the right wins.
        "@type": type,
      });
      alreadyEmitted.add(type);
      continue;
    }
    // Generic JSON-LD shape for every other schema type the author has
    // selected. Carries the post's identifying fields; richer
    // schema-specific fields (e.g. HowTo steps, Recipe ingredients) are
    // expected to land via the authored-schema fields per #2.
    nodes.push({
      "@context": "https://schema.org",
      "@type": type,
      name: seoLabel,
      url: canonical,
      ...(jsonLdDescription ? { description: jsonLdDescription } : {}),
      ...(jsonLdImage ? { image: jsonLdImage } : {}),
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
      ...(post.authorDisplayName
        ? { author: { "@type": "Person", name: post.authorDisplayName } }
        : {}),
    });
    alreadyEmitted.add(type);
  }

  return nodes;
}

export async function PostJsonLd(args: BuildPostJsonLdArgs): Promise<ReactNode> {
  const baseNodes = buildPostJsonLdNodes(args);

  // Let plugins push additional schema.org nodes (Review, Recipe, etc.)
  // via the `seo.jsonld.post` filter. The bus is null on routes that
  // ran before bootEngine() resolved — in that case we just emit the
  // engine-derived nodes without surfacing a degraded-mode warning.
  const bus = getBootBus();
  const merged: JsonLdNode[] = bus
    ? await bus.applyFilters("seo.jsonld.post", baseNodes, {
        post: args.post,
        pageUrl: args.canonical,
        siteUrl: args.seo.siteUrl,
      })
    : baseNodes;

  // De-dup by @type — the engine's `schema_types` loop emits a
  // generic shape for every type the author selected (so e.g.
  // "Review" yields a CreativeWork-style node), and a plugin
  // contributing the same type via the filter (e.g. envisia-reviews
  // emitting a proper Product Review with itemReviewed +
  // reviewRating) would land alongside it. Filter-emitted nodes win
  // because they ran later and carry the richer shape Google
  // actually wants for that type.
  const seen = new Set<string>();
  const nodes: JsonLdNode[] = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    const node = merged[i];
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") {
      if (seen.has(t)) continue;
      seen.add(t);
    }
    nodes.unshift(node);
  }

  if (nodes.length === 0) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(wrapJsonLdGraph(nodes)) }}
    />
  );
}

export interface PostRenderInputs {
  data: Data;
  galleries: Record<number, GalleryDetail>;
  media: Record<string, MediaSummary>;
  menus: Record<string, { items: MenuItemDetail[] }>;
  /** Newspaper widget pre-fetch — keyed by cache key. Same shape the
   *  theme renderer uses; empty when the post body has no Newspaper
   *  blocks. */
  newspaper: Record<string, NewspaperPost[]>;
  pillarsById: Record<number, { id: number; title: string }>;
  topicsBySlug: Record<string, { id: number; name: string; slug: string }>;
  display: { dateFormat: DateFormat; timezone: string };
}

export async function buildPostRenderInputs(post: PostDetail): Promise<PostRenderInputs> {
  const data = parsePuckData(post.contentJson);

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

  // Newspaper widget pre-fetch — walks the post's Puck tree. Returns
  // empty maps when no Newspaper blocks are present (zero DB cost).
  const newspaperSpecs = collectNewspaperSpecs([data]);
  const labelKeys = collectNewspaperLabelKeys([data]);
  const [displayDateFormat, displayTimezone, newspaper, pillarsById, topicsBySlug] = await Promise.all([
    getSetting<DateFormat>(db(), "site.date_format"),
    getSetting<string>(db(), "site.timezone"),
    fetchNewspaperData(newspaperSpecs),
    fetchPillarsById(Array.from(labelKeys.pillarIds)),
    fetchTopicsBySlug(Array.from(labelKeys.topicSlugs)),
  ]);
  const display = {
    dateFormat: displayDateFormat ?? DEFAULT_DATE_FORMAT,
    timezone: typeof displayTimezone === "string" && displayTimezone ? displayTimezone : DEFAULT_TIMEZONE,
  };

  return { data, galleries, media, menus, newspaper, pillarsById, topicsBySlug, display };
}

export function renderPostBodyContent(inputs: PostRenderInputs): ReactNode {
  const { data, galleries, media, menus, newspaper, pillarsById, topicsBySlug, display } = inputs;
  return (
    <Render
      config={puckConfig}
      data={data}
      metadata={{ galleries, media, menus, newspaper, pillarsById, topicsBySlug, display }}
    />
  );
}

export interface RenderPublishedPostArgs {
  post: PostDetail;
  seo: PublishedPostSeo;
  /** Absolute URL used for JSON-LD `url`. Site URL + path. */
  canonical: string;
}

export async function renderPublishedPost({
  post,
  seo,
  canonical,
}: RenderPublishedPostArgs): Promise<ReactNode> {
  const [
    breadcrumbEnabled,
    articleEnabled,
    dateFormat,
    timezone,
  ] = await Promise.all([
    getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    getSetting<boolean>(db(), "seo.schema_article_enabled"),
    getSetting<DateFormat>(db(), "site.date_format"),
    getSetting<string>(db(), "site.timezone"),
  ]);
  const inputs = await buildPostRenderInputs(post);

  const dateLabel = post.publishedAt
    ? formatDate(parseSqliteUtc(post.publishedAt), dateFormat ?? DEFAULT_DATE_FORMAT, timezone ?? DEFAULT_TIMEZONE)
    : null;
  const meta =
    post.authorDisplayName || dateLabel ? (
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {post.authorDisplayName ? <span>By {post.authorDisplayName}</span> : null}
        {post.authorDisplayName && dateLabel ? <span aria-hidden>·</span> : null}
        {dateLabel ? <time dateTime={post.publishedAt ?? undefined}>{dateLabel}</time> : null}
      </span>
    ) : null;

  return (
    <>
      <UnthemedShell title={post.title} featuredImage={toFeaturedThumbVariant(post.featuredImage)} meta={meta}>
        {renderPostBodyContent(inputs)}
      </UnthemedShell>
      <PostJsonLd
        post={post}
        seo={seo}
        canonical={canonical}
        data={inputs.data}
        breadcrumbEnabled={breadcrumbEnabled ?? true}
        articleEnabled={articleEnabled ?? true}
      />
    </>
  );
}
