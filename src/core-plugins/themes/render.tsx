/**
 * Active-theme public render orchestrator.
 *
 * Public routes (`/`, `/[slug]`, `/[slug]/[childSlug]`, `/topics/[slug]`,
 * `not-found`) call this to compose a published view through the
 * currently-active theme's parts (Header, Footer, Sidebars) and the
 * template inner zone matching the route. When no theme is active this
 * returns `null` so the caller falls back to the existing
 * `published-view.tsx` shells unchanged.
 *
 * Phase 7 of the themes-and-menus plan
 * (development_docs/plans/2026-05-07-themes-and-menus.md §4).
 */
import type { ReactNode } from "react";
import { Render, type Data } from "@measured/puck";
import { db } from "@core/db/instance";
import type { DbClient } from "@core/db/client";
import { buildPuckConfigFromAllRegistered } from "@core/blocks/registry";
import { getActiveThemeSlug, getThemeData, resolveTemplateData } from "./service";
// Re-export the parent-fallback resolver so callers that reach for it via
// the theme renderer's surface still find it. Implementation lives in
// service.ts (which has no Next/Auth import surface, so it stays testable).
export { resolveTemplateData } from "./service";
import "@core-plugins/site-widgets";
import "@generated/plugin-blocks";
import {
  postsGridFilterKey,
  resolvePostsGridFilter,
  type PostsGridFilter,
  type PostsGridProps,
} from "@core-plugins/site-widgets/PostsGrid";
import { TableOfContentsMounter } from "@core-plugins/site-widgets/TableOfContentsMounter";
import { StickyContainerMounter } from "@core-plugins/site-widgets/StickyContainerMounter";
import { NewspaperWidgetsMounter } from "@core-plugins/site-widgets/newspaper/NewspaperWidgetsMounter";
import type { NewspaperPost } from "@core-plugins/site-widgets/newspaper/types";
import type { TemplateId } from "./templates";
import {
  COLUMN_PRESETS,
  CONTAINER_WIDTH_MODES,
  CONTAINER_WIDTH_PRESETS,
  DEFAULT_COLUMN_PRESET,
  DEFAULT_CONTAINER_WIDTH_CUSTOM,
  DEFAULT_CONTAINER_WIDTH_MODE,
  DEFAULT_CONTAINER_WIDTH_PRESET,
  computeContainerStyle,
  computeGridClasses,
  type ColumnPreset,
  type ContainerWidthMode,
  type ContainerWidthPreset,
} from "./layout";
import { getBootBus } from "@core/boot";
import "./render-types"; // ensure FilterMap declaration is visible
import { getSetting } from "@core-plugins/settings/registry";
import { resolveSiteUrl } from "@core/site-url";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
  type TimeFormat,
} from "@core/datetime";
import {
  collectMenuLocations,
  getMenuByLocation,
  type MenuItemDetail,
  type MenuDetail,
} from "@core-plugins/menus";
import { prefetchPanelsForMenuLocations } from "@core-plugins/mega-menu/render-helpers";
import { getHomepageContentSource, type HomepageSource } from "./homepage-source-actions";
import {
  getHomepageDisplayOptions,
} from "./homepage-display-actions";
import {
  type PostListOptions,
  type RecentPost as PostListViewRecentPost,
} from "@core-plugins/site-widgets/PostListView";
import {
  getPost,
  listPosts,
  listTopicIdsForPosts,
  countSpikesForPillar,
  countAllPublishedPosts,
  countPublishedPostsInTopic,
  type PostListItem,
} from "@core-plugins/posts";
import { getTopicBySlug, listTopics, type TopicListItem } from "@core-plugins/topics";
import { discoveredPlugins } from "@generated/plugins";
import type { PageDetail } from "@core-plugins/pages";
import { getGallery, type GalleryDetail } from "@core-plugins/galleries";
import { getMediaById, type MediaSummary } from "@core-plugins/media/service";
import { collectMediaIdsFromHtml } from "@core-plugins/pages/blocks/shortcodes";
import type { PostDetail } from "@core-plugins/posts";
import { getAuthorById, type AuthorProfile } from "@core-plugins/users";
import type { SearchResultItem } from "@core/search/search-actions";

export interface ActiveThemeContext {
  /** Which template to use as the inner zone. Either a built-in `TemplateId`
   *  ("homepage", "single-page", "single-post", "single-pillar",
   *  "topic-archive", "not-found", "search-results", "author") or the slug
   *  of a custom template whose `parent_template` is set to one of those
   *  built-ins (e.g. "long-form" cloning "single-post"). `resolveTemplateData`
   *  falls back to the parent's row when a custom slug has no
   *  theme_data entry. */
  templateId: TemplateId | string;
  /** Optional: page being rendered (Single Page / Homepage when home is a static page). */
  page?: PageDetail;
  /** Optional: post being rendered (Single Post). */
  post?: PostDetail;
  /** Pre-rendered page / post body. Built by the route via
   *  `renderPageBodyContent` / `renderPostBodyContent`, which use Puck's
   *  RSC `Render` so nesting inside the theme's outer `<Render>` is
   *  safe (no shared hooks state). The PageContent / PostContent blocks
   *  emit it as JSX. */
  pageBody?: ReactNode;
  postBody?: ReactNode;
  /** Topics assigned to the current post — used by PostMeta chips. */
  postTopics?: TopicListItem[];
  /** Topic for the Topic Archive route. */
  topic?: TopicListItem;
  /** When set, sidebar visibility (`show_left_sidebar` /
   *  `show_right_sidebar`) is read from this template's settings instead
   *  of `templateId`'s. Used by `app/page.tsx` so the site root always
   *  honors the **homepage** template's sidebar toggles, even when the
   *  configured homepage source is a static page (in which case
   *  `templateId` is `"single-page"`). The main-zone content still comes
   *  from `templateId`. */
  sidebarVisibilityTemplateId?: TemplateId | string;
  /** Author profile for the `template-author` route — surfaced to the
   *  AuthorAvatar / AuthorName / AuthorBio / AuthorLinks blocks via
   *  metadata. */
  author?: AuthorProfile;
  /** Active search query for `template-search-results` — drives the
   *  SearchResults block's "Search results for X" header and pagination
   *  links. */
  searchQuery?: string;
  /** 1-based current page in the paginated SearchResults block. */
  searchPage?: number;
  /** Pre-fetched matches across pages + posts for the current query.
   *  SearchResults reads this from metadata and slices it according to
   *  its own `resultsPerPage` prop. */
  searchResults?: SearchResultItem[];
  /** 1-based current page for paginated PostsGrid (Recent Posts)
   *  blocks. Routes that allow paginated post lists (single-post,
   *  single-page, topic-archive, author) read `?page=` and pass it
   *  through; absent on routes that don't. */
  postsPage?: number;
  /** Pathname of the current route (e.g. `/lorem-ipsum/why-do-we-use-it`).
   *  PostsGrid pagination links rebuild URLs on the same path. */
  routePath?: string;
  /** Query-string parameters from the current request. The homepage
   *  uses `searchParams.page` for pagination. Optional — only the
   *  homepage route plumbs this through today; other routes can omit
   *  it without behavior change. */
  searchParams?: Record<string, string | string[] | undefined>;
}

export interface RenderActiveThemeResult {
  themeSlug: string;
  body: ReactNode;
  /** Theme/user-overrides/tokens stylesheet links + brand-token <style>. */
  head: ReactNode;
}

interface RecentPost {
  id: number;
  title: string;
  slug: string;
  url: string;
  publishedAt: string | null;
  featuredImage: string | null;
  /** Two-line excerpt for the PostsGrid "plain" layout. Pulled from
   *  `seoDescription` on the underlying post (the post's stored
   *  excerpt isn't on the list-row projection). Null when missing. */
  excerpt: string | null;
  /** First/primary topic, alphabetical by name. Null when the post has
   *  no topics. PostsGrid uses this to render the optional topic chip. */
  topic: { id: number; name: string; slug: string } | null;
}

interface PostsGridSpec {
  /** Cache key under which `metadata.postsGrid` stores the result. The
   *  block render computes the same key via
   *  `postsGridFilterKey(resolvePostsGridFilter(...))`. */
  key: string;
  /** Resolved filter — topic-based or pillar-based. */
  filter: PostsGridFilter;
  /** Per-page count when paginated; hard cap when not. */
  limit: number;
  /** When true, fetch every match (up to the safety cap inside
   *  `fetchPostsGridData`) so the block can paginate. */
  paginated: boolean;
  /** When true, the block renders all fetched items in a scrollable
   *  container and only uses `limit` as the visible-row estimate —
   *  same fetch behavior as `paginated` (pull up to the safety cap).
   *  Without this flag, the pre-fetcher caps at `limit` and the wrap
   *  container has nothing extra to scroll through. */
  wrap: boolean;
}

interface ChromeSectionArgs {
  /** The header / footer body. */
  inner: ReactNode;
  /** Whether to wrap `inner` in the container constraint. */
  constrained: boolean;
  containerClass: string;
  containerInline: { maxWidth: string } | undefined;
  /** Hex color painted behind the (optionally constrained) inner. */
  bgColor: string;
  /** Hex color painted on the full-bleed band around the inner. Only
   *  visible when `constrained` is true and the container is narrower
   *  than the viewport. */
  edgesColor: string;
}

/**
 * Build a header/footer section with two distinct color layers:
 *
 *   ┌── outer ───────────────────────────────────────────────┐
 *   │ edgesColor                                              │
 *   │     ┌── inner (container-constrained when applicable) ──┐ │
 *   │     │ bgColor                                            │ │
 *   │     │   <header/footer content>                          │ │
 *   │     └────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Either color may be empty (no override). When both are empty the
 * helper returns the inner content unwrapped except for whatever
 * container constraint applies. When only `bgColor` is set and no
 * container constraint is active, both colors are visually identical,
 * so we collapse to a single wrapper to avoid emitting an empty div.
 */
function renderChromeSection(args: ChromeSectionArgs): ReactNode {
  const { inner, constrained, containerClass, containerInline, bgColor, edgesColor } = args;

  const innerStyle: React.CSSProperties = {
    ...(constrained && containerInline ? containerInline : {}),
    ...(bgColor ? { backgroundColor: bgColor } : {}),
  };
  const hasInnerStyle = Object.keys(innerStyle).length > 0;
  const innerClass = constrained ? containerClass : "";
  const needsInnerWrapper = constrained || hasInnerStyle;

  const innerWrapped = needsInnerWrapper ? (
    <div className={innerClass} style={hasInnerStyle ? innerStyle : undefined}>
      {inner}
    </div>
  ) : (
    inner
  );

  return edgesColor ? (
    <div style={{ backgroundColor: edgesColor }}>{innerWrapped}</div>
  ) : (
    innerWrapped
  );
}

type ContentArray = NonNullable<Data["content"]>;

/**
 * Walk every block in a Puck data tree — both the top-level
 * `content` array AND every `zones` entry. The latter holds the
 * children of nested DropZones (e.g. blocks dropped inside a
 * StickyContainer); they're keyed `<parentBlockId>:<zoneName>` and
 * are NOT in the top-level content. Without descending into them,
 * PostsGrid / HomepageMain / menu collectors miss every block that
 * lives inside a container, and the renderer ends up not pre-
 * fetching their data — the public render then shows an empty
 * widget where it should have a populated list.
 */
function forEachBlock(tree: Data, visit: (block: ContentArray[number]) => void): void {
  for (const block of tree.content ?? []) visit(block);
  if (tree.zones) {
    for (const zoneContent of Object.values(tree.zones)) {
      if (!Array.isArray(zoneContent)) continue;
      for (const block of zoneContent) visit(block);
    }
  }
}

/**
 * Flatten a Puck tree to a single array of every block across the
 * top-level `content` and every nested zone. Lets walkers that take
 * a flat `ContentArray` (e.g. `collectMenuLocations`) keep their
 * signature while still seeing widgets inside StickyContainer / any
 * future nested-zone block.
 */
function flattenBlocks(tree: Data): ContentArray {
  const out: ContentArray = [];
  forEachBlock(tree, (block) => out.push(block));
  return out;
}

/**
 * Local copies of the Gallery / RichText shortcode media collectors
 * from `@core-plugins/pages/blocks`. Re-implemented here because the
 * canonical home (`pages/blocks/index.ts`) is also the side-effect
 * registration entry point for every page block — importing it from
 * this server-only file pulls every block's "use client" component
 * (GalleryEmbed, lightbox UI, etc.) along the same import graph and
 * destabilises the React-server / SSR boundary, surfacing as
 * "Invalid hook call" / "useState is null" inside Puck's RSC `<Render>`
 * walk. The functions themselves are tiny, so duplicating them here
 * is cheaper than untangling the barrel.
 */
function collectGalleryIds(
  blocks: Array<{ type?: string; props?: { galleryId?: number | null } }>,
): number[] {
  const ids = new Set<number>();
  for (const block of blocks) {
    if (block.type !== "Gallery") continue;
    const id = block.props?.galleryId;
    if (typeof id === "number" && Number.isFinite(id)) ids.add(id);
  }
  return Array.from(ids);
}

function collectShortcodeMediaIds(
  blocks: Array<{ type?: string; props?: { html?: string } }>,
): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "RichText") continue;
    const html = block.props?.html;
    if (typeof html !== "string" || html.length === 0) continue;
    for (const id of collectMediaIdsFromHtml(html)) ids.add(id);
  }
  return Array.from(ids);
}

/** Walk a Puck data tree and harvest every `(topicSlug, limit)` pair
 *  needed by PostsGrid blocks across all parts + templates rendered
 *  this request. Distinct keys → distinct fetches. */
function collectPostsGridSpecs(
  trees: Data[],
  ctx: {
    post?: PostDetail | null;
    currentTopicSlug?: string;
    author?: AuthorProfile | null;
  },
): PostsGridSpec[] {
  const seen = new Map<string, PostsGridSpec>();
  for (const tree of trees) {
    forEachBlock(tree, (block) => {
      if (block.type !== "PostsGrid") return;
      const raw = (block.props ?? {}) as Partial<
        Pick<
          PostsGridProps,
          | "topicSlug"
          | "limit"
          | "limitMode"
          | "layout"
          | "limitToPillar"
          | "filterByAuthor"
          | "enablePagination"
          | "pillarIds"
        >
      >;
      const filter = resolvePostsGridFilter(
        {
          topicSlug: typeof raw.topicSlug === "string" ? raw.topicSlug : "",
          limitToPillar: raw.limitToPillar === true,
          filterByAuthor: raw.filterByAuthor === true,
          pillarIds: Array.isArray(raw.pillarIds)
            ? (raw.pillarIds.filter((v) => typeof v === "number") as number[])
            : [],
        },
        ctx,
      );
      const limit =
        typeof raw.limit === "number" && Number.isFinite(raw.limit)
          ? Math.max(1, Math.min(50, Math.floor(raw.limit)))
          : 5;
      const paginated = raw.enablePagination === true;
      // Wrap mode mirrors PostsGrid's `effectiveLimitMode`: it only
      // engages for non-grid layouts with pagination off. Outside
      // those, the widget falls back to limit mode and doesn't need
      // the full fetch.
      const wrap =
        raw.limitMode === "wrap" && (raw.layout ?? "list") !== "grid" && !paginated;
      const key = postsGridFilterKey(filter);
      const existing = seen.get(key);
      // When two blocks share a filter, take the highest limit AND
      // OR-together the paginated / wrap flags — whichever needs the
      // bigger fetch wins.
      if (!existing) {
        seen.set(key, { key, filter, limit, paginated, wrap });
      } else {
        existing.limit = Math.max(existing.limit, limit);
        existing.paginated = existing.paginated || paginated;
        existing.wrap = existing.wrap || wrap;
      }
    });
  }
  return Array.from(seen.values());
}

function collectHomepageMainSpecs(trees: Data[]): PostsGridSpec[] {
  for (const tree of trees) {
    let found = false;
    forEachBlock(tree, (block) => {
      if (block.type === "HomepageMain") found = true;
    });
    if (found) {
      // One spec covers all HomepageMain instances. Uses the legacy
      // empty-slug topic key (`topic:`) since the homepage-source
      // override later writes into the same bucket regardless of
      // the source kind (topic / pillar / recent).
      const filter: PostsGridFilter = { kind: "topic", slug: "" };
      return [
        {
          key: postsGridFilterKey(filter),
          filter,
          limit: 12,
          paginated: false,
          wrap: false,
        },
      ];
    }
  }
  return [];
}

function postUrl(p: PostListItem): string {
  if (p.postKind === "spike" && p.parentSlug) return `/${p.parentSlug}/${p.slug}`;
  return `/${p.slug}`;
}

export interface PostAncestor {
  /** Ancestor's title (used as the breadcrumb label). */
  title: string;
  /** Slug — kept for symmetry, not strictly needed by callers. */
  slug: string;
  /** Cumulative URL path from root, e.g. `/pillar` for a pillar,
   *  `/pillar/spike` for a spike under it, etc. */
  url: string;
}

/**
 * Walk a post's `parentId` chain root-ward and return the ancestor
 * list ordered from root to immediate parent (i.e. the order they
 * should appear in a breadcrumb). The chain excludes the post
 * itself — callers append the current post separately.
 *
 * Today's data model only allows pillar → spike (single level), so
 * this returns at most one entry. Future deeper nesting (spike →
 * sub-spike → …) will ship through here without changes. Capped at
 * 16 hops as cycle insurance against corrupted data.
 */
async function buildPostAncestors(
  client: DbClient,
  post: PostDetail,
): Promise<PostAncestor[]> {
  const chain: { title: string; slug: string }[] = [];
  let current: PostDetail | null = post;
  for (let i = 0; i < 16; i++) {
    if (!current?.parentId) break;
    const parent = await getPost(client, current.parentId);
    if (!parent) break;
    chain.unshift({ title: parent.title, slug: parent.slug });
    current = parent;
  }
  let url = "";
  return chain.map((c) => {
    url += `/${c.slug}`;
    return { ...c, url };
  });
}

/**
 * Build a `(postId → first-topic)` map for a batch of posts. Picks the
 * post's alphabetically-first topic so the result is stable across
 * renders. Returns an empty map when there are no posts. Both the
 * `posts_topics` lookup and the global topics list are single
 * round-trips, kept off the hot path of individual block renders.
 */
async function loadFirstTopicForPosts(
  postIds: number[],
): Promise<Map<number, { id: number; name: string; slug: string }>> {
  const out = new Map<number, { id: number; name: string; slug: string }>();
  if (postIds.length === 0) return out;
  const [topicMap, topics] = await Promise.all([
    listTopicIdsForPosts(db(), postIds),
    listTopics(db()),
  ]);
  const byId = new Map(topics.map((t) => [t.id, t]));
  for (const [postId, topicIds] of topicMap) {
    const matched = topicIds
      .map((id) => byId.get(id))
      .filter((t): t is TopicListItem => Boolean(t))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matched.length > 0) {
      out.set(postId, { id: matched[0].id, name: matched[0].name, slug: matched[0].slug });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Newspaper widget SSR pre-fetch: collector + resolver
// ---------------------------------------------------------------------------

interface NewspaperSpec {
  cacheKey: string;
  scope:
    | { kind: "single"; type: "pillar"; key: string }
    | { kind: "single"; type: "topic"; key: string }
    | { kind: "all"; allType: "pillar" | "topic"; keys: string[] };
  limit: number;
}

/**
 * Walk every Puck block in `trees` and collect every pillar id / topic
 * slug referenced by a Newspaper block — used for tab-label resolution.
 *
 * Distinct from `collectNewspaperSpecs`, which is about deciding what
 * data to SSR pre-fetch (for SectionHero / SectionFeatured that's just
 * the first tab). The labels need to be resolved for ALL configured
 * tabs so the inactive ones don't fall back to "Pillar 79".
 */
export function collectNewspaperLabelKeys(trees: Data[]): {
  pillarIds: Set<number>;
  topicSlugs: Set<string>;
} {
  const pillarIds = new Set<number>();
  const topicSlugs = new Set<string>();
  for (const tree of trees) {
    forEachBlock(tree, (block) => {
      if (
        block.type !== "NewspaperHero" &&
        block.type !== "NewspaperSectionHero" &&
        block.type !== "NewspaperSection" &&
        block.type !== "NewspaperSectionFeatured"
      ) {
        return;
      }
      const raw = (block.props ?? {}) as Record<string, unknown>;
      if (Array.isArray(raw.pillarIds)) {
        for (const id of raw.pillarIds) {
          if (typeof id === "number" && Number.isFinite(id)) pillarIds.add(id);
        }
      }
      if (Array.isArray(raw.topicSlugs)) {
        for (const slug of raw.topicSlugs) {
          if (typeof slug === "string" && slug.length > 0) topicSlugs.add(slug);
        }
      }
    });
  }
  return { pillarIds, topicSlugs };
}

/**
 * Walk every Puck block in `trees` and collect a deduped list of
 * NewspaperSpec entries — one per unique (scope, limit) pair. Each of
 * the four Newspaper blocks supplies its active tab's scope + limit
 * via well-defined props the block render reads back to look up data.
 */
export function collectNewspaperSpecs(trees: Data[]): NewspaperSpec[] {
  const seen = new Map<string, NewspaperSpec>();
  for (const tree of trees) {
    forEachBlock(tree, (block) => {
      if (
        block.type !== "NewspaperHero" &&
        block.type !== "NewspaperSectionHero" &&
        block.type !== "NewspaperSection" &&
        block.type !== "NewspaperSectionFeatured"
      ) {
        return;
      }
      const raw = (block.props ?? {}) as Record<string, unknown>;
      // Per-block-type clamp — mirrors each widget's own `safeLimit`
      // logic so the SSR fetches exactly `safeLimit + 1` posts. Without
      // this, the collector's generic clamp could undercount and the
      // widget's `initialHasMore = rawPosts.length > safeLimit` would
      // incorrectly report false (the bug was: SectionFeatured defaults
      // safeLimit to 6 but the collector default was 5 → fetched 6,
      // widget tested 6 > 6 → arrow disabled even with more posts).
      const rawLimit =
        typeof raw.limit === "number" && Number.isFinite(raw.limit)
          ? Math.floor(raw.limit)
          : undefined;
      const limit = (() => {
        switch (block.type) {
          case "NewspaperHero":
            return Math.max(1, Math.min(8, rawLimit ?? 5));
          case "NewspaperSection":
            return Math.max(2, Math.min(6, rawLimit ?? 3));
          case "NewspaperSectionHero":
            return Math.max(4, Math.min(8, rawLimit ?? 5));
          case "NewspaperSectionFeatured":
            return Math.max(5, Math.min(10, rawLimit ?? 6));
          default:
            return Math.max(1, Math.min(24, rawLimit ?? 5));
        }
      })();

      // NewspaperHero: supports "all" (site-wide), "pillar" (multi), or
      // "topic" scope. Pillar mode is now multi-select via PillarMulti-
      // Picker — an empty `pillarIds` array is the picker's "all
      // checked" sentinel and is interpreted as "all spikes regardless
      // of pillar" so a fresh widget never silent-fails.
      if (block.type === "NewspaperHero") {
        const t = raw.type === "pillar" || raw.type === "topic" ? raw.type : "all";
        let cacheKey: string;
        let scope: NewspaperSpec["scope"];
        if (t === "pillar") {
          const ids = Array.isArray(raw.pillarIds)
            ? Array.from(
                new Set(
                  (raw.pillarIds as unknown[]).filter(
                    (n): n is number => typeof n === "number",
                  ),
                ),
              ).sort((a, b) => a - b)
            : [];
          if (ids.length === 0) {
            cacheKey = "hero:all-spikes";
            scope = { kind: "all", allType: "pillar", keys: [] };
          } else if (ids.length === 1) {
            cacheKey = `pillars:${ids[0]}`;
            scope = { kind: "single", type: "pillar", key: String(ids[0]) };
          } else {
            cacheKey = `pillars:${ids.join(",")}`;
            scope = { kind: "all", allType: "pillar", keys: ids.map(String) };
          }
        } else if (t === "topic") {
          const slugs = Array.isArray(raw.topicSlugs)
            ? Array.from(
                new Set(
                  (raw.topicSlugs as unknown[]).filter(
                    (s): s is string => typeof s === "string" && s.length > 0,
                  ),
                ),
              ).sort()
            : [];
          if (slugs.length === 0) {
            cacheKey = "hero:all-topic-posts";
            scope = { kind: "all", allType: "topic", keys: [] };
          } else if (slugs.length === 1) {
            cacheKey = `topics:${slugs[0]}`;
            scope = { kind: "single", type: "topic", key: slugs[0]! };
          } else {
            cacheKey = `topics:${slugs.join(",")}`;
            scope = { kind: "all", allType: "topic", keys: slugs };
          }
        } else {
          cacheKey = "hero:all";
          scope = { kind: "all", allType: "topic", keys: [] };
        }
        const existing = seen.get(cacheKey);
        if (!existing) {
          seen.set(cacheKey, { cacheKey, scope, limit });
        } else if (existing.limit < limit) {
          existing.limit = limit;
        }
        return;
      }

      const type = raw.type === "pillar" ? "pillar" : "topic";
      // NOTE: raw.showAllTab is read elsewhere (in the block's render +
      // the mounter's tab strip). The SSR collector doesn't need it
      // anymore — the active tab is always the first picked scope per
      // the "All-last" tab order.

      // Section block — was single-scope, now multi-scope. Empty array
      // is the picker's "all of that kind" sentinel; non-empty arrays
      // are keyed by sorted ids/slugs for cache-key stability.
      if (block.type === "NewspaperSection") {
        let cacheKey: string;
        let scope: NewspaperSpec["scope"];
        if (type === "pillar") {
          const ids = Array.isArray(raw.pillarIds)
            ? Array.from(
                new Set(
                  (raw.pillarIds as unknown[]).filter(
                    (n): n is number => typeof n === "number",
                  ),
                ),
              ).sort((a, b) => a - b)
            : [];
          if (ids.length === 0) {
            cacheKey = "section:all-spikes";
            scope = { kind: "all", allType: "pillar", keys: [] };
          } else if (ids.length === 1) {
            cacheKey = `pillars:${ids[0]}`;
            scope = { kind: "single", type: "pillar", key: String(ids[0]) };
          } else {
            cacheKey = `pillars:${ids.join(",")}`;
            scope = { kind: "all", allType: "pillar", keys: ids.map(String) };
          }
        } else {
          const slugs = Array.isArray(raw.topicSlugs)
            ? Array.from(
                new Set(
                  (raw.topicSlugs as unknown[]).filter(
                    (s): s is string => typeof s === "string" && s.length > 0,
                  ),
                ),
              ).sort()
            : [];
          if (slugs.length === 0) {
            cacheKey = "section:all-topic-posts";
            scope = { kind: "all", allType: "topic", keys: [] };
          } else if (slugs.length === 1) {
            cacheKey = `topics:${slugs[0]}`;
            scope = { kind: "single", type: "topic", key: slugs[0]! };
          } else {
            cacheKey = `topics:${slugs.join(",")}`;
            scope = { kind: "all", allType: "topic", keys: slugs };
          }
        }
        const existing = seen.get(cacheKey);
        if (!existing) {
          seen.set(cacheKey, { cacheKey, scope, limit });
        } else if (existing.limit < limit) {
          existing.limit = limit;
        }
        return;
      }

      // Section Hero / Section Featured: ordered list. After moving the
      // "All" tab to the END (user feedback), the SSR-displayed default
      // active tab is now the FIRST PICKED SCOPE — not the All union.
      // Pre-fetch that scope; the "All" tab is lazy-fetched on click via
      // the client mounter when (and if) the user picks it.
      //
      // When the picker is in its "all checked" sentinel state (empty
      // array), the widget renders a synthetic "All" tab keyed
      // `<widget>:all-{spikes,topic-posts}` — we mirror that here so
      // the SSR pre-fetch lands under the same key the render reads.
      const pillarIds = Array.isArray(raw.pillarIds)
        ? (raw.pillarIds.filter((v) => typeof v === "number") as number[])
        : [];
      const topicSlugs = Array.isArray(raw.topicSlugs)
        ? (raw.topicSlugs.filter((v) => typeof v === "string") as string[])
        : [];
      const keys = type === "pillar" ? pillarIds.map(String) : topicSlugs;
      let cacheKey: string;
      let scope: NewspaperSpec["scope"];
      if (keys.length === 0) {
        const widgetPrefix =
          block.type === "NewspaperSectionHero" ? "section-hero" : "section-featured";
        cacheKey = `${widgetPrefix}:${type === "pillar" ? "all-spikes" : "all-topic-posts"}`;
        scope = { kind: "all", allType: type, keys: [] };
      } else {
        const firstKey = keys[0]!;
        cacheKey = `${type}:${firstKey}`;
        scope = { kind: "single", type, key: firstKey };
      }
      const existing = seen.get(cacheKey);
      if (!existing) {
        seen.set(cacheKey, { cacheKey, scope, limit });
      } else if (existing.limit < limit) {
        existing.limit = limit;
      }
    });
  }
  return Array.from(seen.values());
}

async function loadAuthorNameForPosts(
  postIds: number[],
): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  if (postIds.length === 0) return map;
  const placeholders = postIds.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT p.id, u.display_name
            FROM posts p
            LEFT JOIN users u ON u.id = p.created_by
            WHERE p.id IN (${placeholders})`,
    args: postIds,
  });
  for (const row of r.rows) {
    map.set(Number(row.id), row.display_name ? String(row.display_name) : null);
  }
  return map;
}

export async function fetchPillarsById(
  ids: number[],
): Promise<Record<number, { id: number; title: string }>> {
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id, title FROM posts WHERE tenant_id = 1 AND post_kind = 'pillar' AND id IN (${placeholders})`,
    args: ids,
  });
  const out: Record<number, { id: number; title: string }> = {};
  for (const row of r.rows) {
    out[Number(row.id)] = { id: Number(row.id), title: String(row.title) };
  }
  return out;
}

export async function fetchTopicsBySlug(
  slugs: string[],
): Promise<Record<string, { id: number; name: string; slug: string }>> {
  if (slugs.length === 0) return {};
  const placeholders = slugs.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT id, name, slug FROM topics WHERE tenant_id = 1 AND slug IN (${placeholders})`,
    args: slugs,
  });
  const out: Record<string, { id: number; name: string; slug: string }> = {};
  for (const row of r.rows) {
    out[String(row.slug)] = {
      id: Number(row.id),
      name: String(row.name),
      slug: String(row.slug),
    };
  }
  return out;
}

export async function fetchNewspaperData(
  specs: NewspaperSpec[],
): Promise<Record<string, NewspaperPost[]>> {
  if (specs.length === 0) return {};
  const out: Record<string, NewspaperPost[]> = {};

  await Promise.all(
    specs.map(async (spec) => {
      let topicIds: number[] | undefined;
      let pillarIds: number[] | undefined;
      let kind: "spike" | undefined;

      if (spec.scope.kind === "single") {
        if (spec.scope.type === "pillar") {
          pillarIds = [Number.parseInt(spec.scope.key, 10)];
          kind = "spike";
        } else {
          const t = await getTopicBySlug(db(), spec.scope.key);
          if (!t) {
            out[spec.cacheKey] = [];
            return;
          }
          topicIds = [t.id];
        }
      } else if (spec.scope.allType === "pillar") {
        pillarIds = spec.scope.keys.map((k) => Number.parseInt(k, 10));
        kind = "spike";
      } else {
        const ids: number[] = [];
        for (const slug of spec.scope.keys) {
          const t = await getTopicBySlug(db(), slug);
          if (t) ids.push(t.id);
        }
        // NewspaperHero passes empty keys; that means "all posts" —
        // leave topicIds undefined so listPosts returns everything.
        if (ids.length > 0) topicIds = ids;
      }

      const rows = await listPosts(db(), {
        status: "published",
        sort: "published_at",
        ...(kind ? { kind } : {}),
        ...(pillarIds ? { pillarIds } : {}),
        ...(topicIds ? { topicIds } : {}),
      });
      // One-past-limit so widgets / mounter can derive `hasMore` without
      // a second query. Per-widget render slices back down to `spec.limit`.
      const sliced = rows.slice(0, spec.limit + 1);
      const ids = sliced.map((p) => p.id);
      const [topicMap, authorMap] = await Promise.all([
        loadFirstTopicForPosts(ids),
        loadAuthorNameForPosts(ids),
      ]);

      out[spec.cacheKey] = sliced.map((p) => ({
        id: p.id,
        title: p.title,
        url: postUrl(p),
        featuredImage: p.featuredImage,
        publishedAt: p.publishedAt,
        excerpt: p.excerpt ?? p.seoDescription,
        topic: topicMap.get(p.id) ?? null,
        authorName: authorMap.get(p.id) ?? null,
      }));
    }),
  );

  return out;
}

async function fetchPostsGridData(
  specs: PostsGridSpec[],
  routeTopicSlug: string | undefined,
): Promise<Record<string, RecentPost[]>> {
  if (specs.length === 0) return {};
  // Hard cap on the unpaginated case stays the spec's own limit. The
  // paginated case fetches up to this safety ceiling so the block can
  // walk pages without re-fetching. 200 covers ~20 pages of 10 — fine
  // for typical blog scope; can be raised later if a site needs it.
  const PAGINATION_FETCH_CAP = 200;
  const trimmed: Record<string, PostListItem[]> = {};
  await Promise.all(
    specs.map(async (spec) => {
      let posts: PostListItem[] = [];
      // Public widget data path — order by publish date (newest-published
      // first) rather than updated_at (which is the admin-list default).
      const publicSort = "published_at" as const;
      if (spec.filter.kind === "pillar") {
        // Spikes belonging to the configured pillar.
        posts = await listPosts(db(), {
          status: "published",
          kind: "spike",
          pillarId: spec.filter.pillarId,
          sort: publicSort,
        });
      } else if (spec.filter.kind === "pillars-multi") {
        // Spikes whose parent is one of the explicitly-picked pillars.
        // The resolver guarantees `pillarIds` is non-empty here (the
        // `[]` sentinel falls through to topic filter upstream).
        posts = await listPosts(db(), {
          status: "published",
          kind: "spike",
          pillarIds: spec.filter.pillarIds,
          sort: publicSort,
        });
      } else if (spec.filter.kind === "author") {
        // Posts authored by the route's author (on `/author/<u>`).
        posts = await listPosts(db(), {
          status: "published",
          authorId: spec.filter.authorId,
          sort: publicSort,
        });
      } else {
        // Empty spec slug + a route-provided topic slug means "scope
        // to the current topic" (sidebar PostsGrid on a topic archive
        // route). On all other routes, empty means "all posts."
        const effectiveSlug = spec.filter.slug || routeTopicSlug || "";
        let topicIds: number[] | undefined;
        if (effectiveSlug) {
          const t = await getTopicBySlug(db(), effectiveSlug);
          if (!t) {
            trimmed[spec.key] = [];
            return;
          }
          topicIds = [t.id];
        }
        posts = await listPosts(db(), { status: "published", topicIds, sort: publicSort });
      }
      const cap = spec.paginated || spec.wrap ? PAGINATION_FETCH_CAP : spec.limit;
      trimmed[spec.key] = posts.slice(0, cap);
    }),
  );

  // Single batch lookup for "first topic" across every post the
  // PostsGrid blocks need — keeps topic-chip rendering off the per-spec
  // round-trip path.
  const allPostIds = Array.from(
    new Set(Object.values(trimmed).flatMap((rows) => rows.map((p) => p.id))),
  );
  const firstTopic = await loadFirstTopicForPosts(allPostIds);

  const result: Record<string, RecentPost[]> = {};
  for (const [key, posts] of Object.entries(trimmed)) {
    result[key] = posts.map(
      (p): RecentPost => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        url: postUrl(p),
        publishedAt: p.publishedAt,
        featuredImage: p.featuredImage,
        excerpt: p.excerpt ?? p.seoDescription,
        topic: firstTopic.get(p.id) ?? null,
      }),
    );
  }
  // Mirror the route topic slug under both its `topic:<slug>` key
  // (canonical) AND its bare slug (legacy compat) so older saves that
  // hadn't been re-rendered yet keep finding data via the old lookup
  // path. Same for the all-posts bucket.
  const allKey = postsGridFilterKey({ kind: "topic", slug: "" });
  if (allKey in result) {
    result[""] = result[allKey];
  }
  if (routeTopicSlug) {
    const routeKey = postsGridFilterKey({ kind: "topic", slug: routeTopicSlug });
    if (routeKey in result) {
      result[routeTopicSlug] = result[routeKey];
    } else if (allKey in result) {
      result[routeTopicSlug] = result[allKey];
    }
  }
  return result;
}

/**
 * Resolve which sidebar Puck data to render for the active template.
 *
 * Rules:
 *   - When `customEnabled` is falsy → always use the shared default.
 *   - When `customEnabled` is true → use the per-template override if it
 *     exists AND has at least one block in either content or any zone.
 *     Otherwise fall back to the shared default. This keeps the public
 *     site stable when a user toggles the override on in the builder
 *     but hasn't saved any widgets yet — they keep seeing the shared
 *     sidebar until they actually publish a custom layout.
 */
function pickSidebarData(
  customEnabled: boolean | null | undefined,
  customRow: { puckData: unknown } | null | undefined,
  sharedRow: { puckData: unknown } | null | undefined,
): Data {
  if (customEnabled) {
    const custom = parsePuck(customRow?.puckData);
    const hasCustomContent =
      (custom.content?.length ?? 0) > 0 ||
      Object.values(custom.zones ?? {}).some(
        (z) => Array.isArray(z) && z.length > 0,
      );
    if (hasCustomContent) return custom;
  }
  return parsePuck(sharedRow?.puckData);
}

function parsePuck(value: unknown): Data {
  if (
    value &&
    typeof value === "object" &&
    "content" in (value as Record<string, unknown>) &&
    Array.isArray((value as { content: unknown }).content)
  ) {
    const v = value as Record<string, unknown>;
    // Puck's Render does `"props" in data.root` — if root is missing or
    // not an object the operator throws. Guarantee it is always present.
    // `zones` carries data for nested DropZones (e.g. blocks like
    // StickyContainer that host other widgets); without it those
    // blocks render empty in production.
    return {
      content: (v.content as Data["content"]),
      root: (v.root && typeof v.root === "object" ? v.root : {}) as Data["root"],
      zones:
        v.zones && typeof v.zones === "object"
          ? (v.zones as NonNullable<Data["zones"]>)
          : {},
    };
  }
  return { content: [], root: {}, zones: {} };
}

// ---------------------------------------------------------------------------
// resolveHomepageDisplay
// ---------------------------------------------------------------------------

/**
 * Input to `resolveHomepageDisplay`. Keeps the helper testable in isolation
 * from the database — callers pre-fetch posts and the total count.
 */
export interface ResolveHomepageDisplayInput {
  posts: PostListViewRecentPost[];
  totalCount: number;
  searchParams: Record<string, string | string[] | undefined> | undefined;
  routePath: string;
  display: { dateFormat: DateFormat; timezone: string };
}

/**
 * Resolve the `PostListOptions` shape for the homepage's main post-list slot.
 *
 * Reads the current display settings via `getHomepageDisplayOptions()`,
 * computes pagination math from `searchParams.page`, and returns the
 * `PostListOptions` object that lands on `metadata.homepageDisplay`.
 *
 * Pure read — no permission check needed. The homepage renderer (which is
 * a server component) calls this after it has already fetched the posts and
 * the total count for the active source kind.
 */
export async function resolveHomepageDisplay(
  input: ResolveHomepageDisplayInput,
): Promise<PostListOptions> {
  const settings = await getHomepageDisplayOptions();
  const limit = settings.limit;
  let pagination: PostListOptions["pagination"] = null;

  if (settings.paginationEnabled) {
    const totalPages = Math.max(1, Math.ceil(input.totalCount / limit));
    const rawPage = input.searchParams?.page;
    const pageStr = Array.isArray(rawPage) ? rawPage[0] : rawPage;
    const parsed = pageStr ? Number.parseInt(pageStr, 10) : NaN;
    const currentPage =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(totalPages, Math.max(1, parsed))
        : 1;
    const path = input.routePath || "/";
    pagination = {
      currentPage,
      totalPages,
      linkFor: (page) => (page <= 1 ? path : `${path}?page=${page}`),
      style: settings.paginationStyle,
      type: settings.paginationType,
      align: settings.paginationAlign,
    };
  }

  return {
    posts: input.posts,
    layout: settings.layout,
    limit,
    showThumbnail: settings.showThumbnail,
    showTopic: settings.showTopic,
    gridColumns: settings.gridColumns,
    gridAspect: settings.gridAspect,
    pagination,
    display: input.display,
  };
}

export async function renderActiveTheme(
  ctx: ActiveThemeContext,
): Promise<RenderActiveThemeResult | null> {
  const slug = await getActiveThemeSlug(db());
  if (!slug) return null;

  // Confirm the theme is still discoverable on disk; if a slug is set
  // but the folder was removed, fall through to legacy rather than
  // crashing.
  const themeStillExists = discoveredPlugins.some(
    (p) => p.manifest.type === "theme" && p.manifest.slug === slug,
  );
  if (!themeStillExists) return null;

  const puckConfig = buildPuckConfigFromAllRegistered();

  const layoutTemplateId = ctx.sidebarVisibilityTemplateId ?? ctx.templateId;

  const [
    headerRow,
    footerRow,
    sharedLeftRow,
    sharedRightRow,
    customLeftRow,
    customRightRow,
    templateRow,
    showLeft,
    showRight,
    customLeftEnabled,
    customRightEnabled,
    columnPresetRaw,
    expandMainRaw,
    containerModeRaw,
    containerPresetRaw,
    containerCustomRaw,
    applyToHeaderRaw,
    applyToFooterRaw,
    headerBgColorRaw,
    headerEdgesColorRaw,
    bodyBgColorRaw,
    bodyEdgesColorRaw,
    footerBgColorRaw,
    footerEdgesColorRaw,
    themeLogoRaw,
    faviconRaw,
    headerStickyRaw,
    headerStickyMobileRaw,
    headerShadowRaw,
  ] = await Promise.all([
    getThemeData(db(), slug, "part", "header"),
    getThemeData(db(), slug, "part", "footer"),
    // The shared "default" sidebar parts. Always loaded so we can fall
    // back to them if a template opts in to custom sidebars but no
    // per-template row exists yet (e.g. the user toggled the override
    // on in the builder but never saved any widgets in it).
    getThemeData(db(), slug, "part", "left-sidebar"),
    getThemeData(db(), slug, "part", "right-sidebar"),
    // Per-template overrides keyed `(left|right)-sidebar:<templateId>`.
    // These only "win" when the template's `custom_*_sidebar` setting
    // is true AND the row actually has data — otherwise we fall back
    // to the shared part above.
    getThemeData(db(), slug, "part", `left-sidebar:${layoutTemplateId}`),
    getThemeData(db(), slug, "part", `right-sidebar:${layoutTemplateId}`),
    // resolveTemplateData falls back to the parent template's row when
    // a custom template's row is missing (e.g. theme was switched and
    // the custom doesn't exist there) so the public site keeps rendering.
    resolveTemplateData(db(), slug, ctx.templateId).then((r) => r.row),
    getSetting<boolean>(db(), `theme.${slug}.template.${layoutTemplateId}.show_left_sidebar`),
    getSetting<boolean>(db(), `theme.${slug}.template.${layoutTemplateId}.show_right_sidebar`),
    getSetting<boolean>(db(), `theme.${slug}.template.${layoutTemplateId}.custom_left_sidebar`),
    getSetting<boolean>(db(), `theme.${slug}.template.${layoutTemplateId}.custom_right_sidebar`),
    getSetting<string>(db(), `theme.${slug}.template.${layoutTemplateId}.column_preset`),
    getSetting<boolean>(db(), `theme.${slug}.template.${layoutTemplateId}.expand_main_when_no_sidebars`),
    getSetting<string>(db(), `theme.${slug}.container_width_mode`),
    getSetting<string>(db(), `theme.${slug}.container_width_preset`),
    getSetting<string>(db(), `theme.${slug}.container_width_custom`),
    getSetting<boolean>(db(), `theme.${slug}.container_apply_to_header`),
    getSetting<boolean>(db(), `theme.${slug}.container_apply_to_footer`),
    // Theme-owned settings (NextPresso registers them; other themes may
    // not). Empty string or unset → header / body / footer keep their
    // native chrome. Two colors each: the inner `_bg_color` paints
    // behind the container content, and the outer `_edges_color` paints
    // the full-bleed band outside the container.
    getSetting<string>(db(), `theme.${slug}.header_bg_color`),
    getSetting<string>(db(), `theme.${slug}.header_edges_color`),
    getSetting<string>(db(), `theme.${slug}.body_bg_color`),
    getSetting<string>(db(), `theme.${slug}.body_edges_color`),
    getSetting<string>(db(), `theme.${slug}.footer_bg_color`),
    getSetting<string>(db(), `theme.${slug}.footer_edges_color`),
    // Site logo — single source of truth. The SiteLogo block reads
    // this from `metadata.themeLogoUrl` so the builder and the live
    // render always show the same image as the theme settings page.
    getSetting<string>(db(), `theme.${slug}.logo_media_id`),
    // Favicon (png/ico) stored as a base64 data URL.
    getSetting<string>(db(), `theme.${slug}.favicon_data`),
    // When true, the header pins to the top of the viewport on scroll.
    // Independent per-breakpoint flags so the desktop and mobile sticky
    // behavior can be toggled separately (e.g. sticky on desktop but
    // free-scrolling on mobile to give content the full viewport).
    getSetting<boolean>(db(), `theme.${slug}.header_sticky`),
    getSetting<boolean>(db(), `theme.${slug}.header_sticky_mobile`),
    // Drop-shadow scale beneath the header — empty / unknown → "none".
    getSetting<string>(db(), `theme.${slug}.header_shadow`),
  ]);

  // Saved settings round-trip through JSON, so any drift between the
  // registered enum values and what's in the DB falls back to the
  // documented default rather than rendering with an unknown preset
  // (which would produce an empty class string and an unstyled grid).
  const columnPreset: ColumnPreset =
    typeof columnPresetRaw === "string" &&
    (COLUMN_PRESETS as readonly string[]).includes(columnPresetRaw)
      ? (columnPresetRaw as ColumnPreset)
      : DEFAULT_COLUMN_PRESET;
  const expandMainWhenNoSidebars = expandMainRaw !== false;
  const containerMode: ContainerWidthMode =
    typeof containerModeRaw === "string" &&
    (CONTAINER_WIDTH_MODES as readonly string[]).includes(containerModeRaw)
      ? (containerModeRaw as ContainerWidthMode)
      : DEFAULT_CONTAINER_WIDTH_MODE;
  const containerPreset: ContainerWidthPreset =
    typeof containerPresetRaw === "string" &&
    (CONTAINER_WIDTH_PRESETS as readonly string[]).includes(containerPresetRaw)
      ? (containerPresetRaw as ContainerWidthPreset)
      : DEFAULT_CONTAINER_WIDTH_PRESET;
  const containerCustom =
    typeof containerCustomRaw === "string" && containerCustomRaw.trim()
      ? containerCustomRaw
      : DEFAULT_CONTAINER_WIDTH_CUSTOM;
  const applyContainerToHeader = applyToHeaderRaw !== false;
  const applyContainerToFooter = applyToFooterRaw !== false;
  // Accept the empty string (the registered default for "no override")
  // and any 6-digit hex value. Anything else is treated as "no override"
  // — defends against legacy / corrupted rows without crashing the page.
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const sanitizeHex = (raw: unknown): string =>
    typeof raw === "string" && HEX_RE.test(raw) ? raw : "";
  const headerBgColor = sanitizeHex(headerBgColorRaw);
  const headerEdgesColor = sanitizeHex(headerEdgesColorRaw);
  const bodyBgColor = sanitizeHex(bodyBgColorRaw);
  const bodyEdgesColor = sanitizeHex(bodyEdgesColorRaw);
  const footerBgColor = sanitizeHex(footerBgColorRaw);
  const footerEdgesColor = sanitizeHex(footerEdgesColorRaw);
  const themeLogoUrl = typeof themeLogoRaw === "string" ? themeLogoRaw : "";
  const headerStickyDesktop = headerStickyRaw === true;
  const headerStickyMobile = headerStickyMobileRaw === true;
  // Tailwind keeps each `shadow-*` class alive because we list them as
  // string literals here — purge can't see the user-selected value.
  const HEADER_SHADOW_CLASS: Record<string, string> = {
    none: "",
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg",
    xl: "shadow-xl",
  };
  const headerShadowClass =
    typeof headerShadowRaw === "string" && headerShadowRaw in HEADER_SHADOW_CLASS
      ? HEADER_SHADOW_CLASS[headerShadowRaw]
      : "";
  // Accept only data URLs we can confidently feed back to the browser.
  // Anything else (legacy / corrupted rows) is dropped silently.
  const faviconUrl =
    typeof faviconRaw === "string" &&
    /^data:image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(faviconRaw)
      ? faviconRaw
      : "";
  const faviconType = faviconUrl.startsWith("data:image/png")
    ? "image/png"
    : faviconUrl.startsWith("data:image/svg+xml")
      ? "image/svg+xml"
      : faviconUrl
        ? "image/x-icon"
        : "";

  const headerData = parsePuck(headerRow?.puckData);
  const footerData = parsePuck(footerRow?.puckData);
  // Custom sidebar resolver: when the template's override flag is on
  // AND the per-template row exists with non-empty content, use it;
  // otherwise fall back to the shared default. The "non-empty" check
  // matters so that toggling the flag on without ever saving doesn't
  // silently blank the sidebar — the user keeps seeing the default
  // until they save something into the custom override.
  const leftData = pickSidebarData(customLeftEnabled, customLeftRow, sharedLeftRow);
  const rightData = pickSidebarData(customRightEnabled, customRightRow, sharedRightRow);
  const templateData = parsePuck(templateRow?.puckData);

  // Flatten every rendered tree once — header, sidebars, footer, and
  // the active template's main zone — so cross-cutting collectors
  // (menus, galleries, shortcode media) walk the same union of blocks.
  // `flattenBlocks` descends into nested DropZone content (StickyContainer
  // children etc.), so widgets dropped into containers are visible to
  // every collector below.
  const allBlocks = [
    ...flattenBlocks(headerData),
    ...flattenBlocks(footerData),
    ...flattenBlocks(leftData),
    ...flattenBlocks(rightData),
    ...flattenBlocks(templateData),
  ];

  // Menus referenced anywhere in any rendered tree.
  const menuLocations = Array.from(new Set(collectMenuLocations(allBlocks)));
  // Gallery widgets dropped into theme zones (homepage main, single-page
  // main, sidebars) reference galleries by id. Without pre-fetching here
  // the Gallery render fn falls through to its "loading…" placeholder
  // because `metadata.galleries[id]` is empty. The page / post viewers
  // do the same gather-and-inject at their own boundaries; the theme
  // tree needs its own copy because `renderActiveTheme` builds a
  // separate metadata object.
  const galleryIds = collectGalleryIds(allBlocks);
  // RichText shortcodes (`[img]` / `[thumb]`) inside theme-zone
  // RichText blocks reference media by id and need the same prefetch.
  const shortcodeMediaIds = collectShortcodeMediaIds(allBlocks);

  const [
    menusFetched,
    galleriesFetched,
    mediaFetched,
    megaPanels,
  ] = await Promise.all([
    menuLocations.length > 0
      ? Promise.all(menuLocations.map((loc) => getMenuByLocation(db(), loc)))
      : Promise.resolve([]),
    galleryIds.length > 0
      ? Promise.all(galleryIds.map((id) => getGallery(db(), id)))
      : Promise.resolve([]),
    shortcodeMediaIds.length > 0
      ? Promise.all(shortcodeMediaIds.map((id) => getMediaById(db(), id)))
      : Promise.resolve([]),
    // Mega-menu plugin pre-fetches all panels for the menus we just
    // collected and pre-renders each one to opaque ReactNode. NavMenu
    // reads `metadata.megaPanels[location][itemId]` to decide whether
    // to render an item with a mega bar instead of the default
    // dropdown. Returns an empty record when no panels exist for any
    // of the rendered menus, keeping NavMenu's branch a no-op.
    prefetchPanelsForMenuLocations(db(), menuLocations),
  ]);

  const menus: Record<string, { items: MenuItemDetail[]; style: MenuDetail["style"] }> = {};
  menuLocations.forEach((loc, i) => {
    const detail = menusFetched[i];
    if (detail) menus[loc] = { items: detail.items, style: detail.style };
  });

  const galleries: Record<number, GalleryDetail> = {};
  galleryIds.forEach((id, i) => {
    const detail = galleriesFetched[i];
    if (detail) galleries[id] = detail;
  });

  const media: Record<string, MediaSummary> = {};
  shortcodeMediaIds.forEach((id, i) => {
    const summary = mediaFetched[i];
    if (summary) media[id] = summary;
  });

  // PostsGrid pre-fetch (across every tree). The collector resolves
  // each block's filter (topic / pillar / author) using the route
  // context — pillar mode picks up `ctx.post`, author mode picks up
  // `ctx.author` (only set on `/author/<u>` routes).
  const postsGridSpecs = collectPostsGridSpecs(
    [headerData, footerData, leftData, rightData, templateData],
    { post: ctx.post, currentTopicSlug: ctx.topic?.slug, author: ctx.author },
  );
  const homepageMainSpecs = collectHomepageMainSpecs([
    headerData,
    footerData,
    leftData,
    rightData,
    templateData,
  ]);
  const allSpecs = [...postsGridSpecs, ...homepageMainSpecs];
  const postsGrid = await fetchPostsGridData(allSpecs, ctx.topic?.slug);

  const newspaperSpecs = collectNewspaperSpecs([
    headerData,
    footerData,
    leftData,
    rightData,
    templateData,
  ]);
  const newspaper = await fetchNewspaperData(newspaperSpecs);

  // Collect all pillar IDs + topic slugs referenced across Newspaper blocks
  // so tab labels can be resolved at render time without extra per-block
  // queries. Walks the trees directly (rather than reading from
  // newspaperSpecs) because SectionHero/SectionFeatured specs only carry
  // the FIRST picked scope — the other tabs would otherwise fall back to
  // generic "Pillar 79" labels.
  const labelKeys = collectNewspaperLabelKeys([
    headerData,
    footerData,
    leftData,
    rightData,
    templateData,
  ]);
  const [pillarsById, topicsBySlug] = await Promise.all([
    fetchPillarsById(Array.from(labelKeys.pillarIds)),
    fetchTopicsBySlug(Array.from(labelKeys.topicSlugs)),
  ]);

  let homepageSource: HomepageSource | undefined = undefined;
  // Stashed so we can call resolveHomepageDisplay after displayDateFormat
  // is fetched below. Only set when kind !== "page".
  let homepagePostsForDisplay: RecentPost[] | undefined = undefined;
  let homepageTotalCount = 0;
  if (ctx.templateId === "homepage") {
    homepageSource = await getHomepageContentSource();

    // Read display settings so we know the limit + pagination state
    // before fetching. This avoids a second round-trip later.
    const displaySettings = await getHomepageDisplayOptions();
    const homeLimit = displaySettings.limit;
    const wantPagination = displaySettings.paginationEnabled;

    // Parse the current page early — needed to know how wide to fetch.
    const rawPage = ctx.searchParams?.page;
    const pageStr = Array.isArray(rawPage) ? rawPage[0] : rawPage;
    const parsedPage = pageStr ? Number.parseInt(pageStr, 10) : NaN;
    const requestedPage =
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    // Kind-aware post fetching + total count for pagination math.
    // The count is a separate lightweight COUNT(*) query — fast on SQLite.
    let allHomepagePosts: PostListItem[] = [];

    if (homepageSource.kind === "topic" && homepageSource.topic) {
      [allHomepagePosts, homepageTotalCount] = await Promise.all([
        listPosts(db(), {
          status: "published",
          topicIds: [homepageSource.topic.id],
          sort: "published_at",
        }),
        countPublishedPostsInTopic(db(), homepageSource.topic.id),
      ]);
    } else if (homepageSource.kind === "pillar" && homepageSource.pillar) {
      [allHomepagePosts, homepageTotalCount] = await Promise.all([
        listPosts(db(), {
          status: "published",
          kind: "spike",
          pillarId: homepageSource.pillar.id,
          sort: "published_at",
        }),
        countSpikesForPillar(db(), homepageSource.pillar.id),
      ]);
    } else if (homepageSource.kind === "recent") {
      [allHomepagePosts, homepageTotalCount] = await Promise.all([
        listPosts(db(), { status: "published", sort: "published_at" }),
        countAllPublishedPosts(db()),
      ]);
    }
    // kind === "page" doesn't fetch posts — HomepageMain renders the
    // page body from `ctx.pageBody` (already in metadata) instead.

    if (homepageSource.kind !== "page" && allHomepagePosts.length > 0) {
      // Slice to the correct page window.
      let pagePosts: PostListItem[];
      if (wantPagination) {
        const totalPages = Math.max(1, Math.ceil(homepageTotalCount / homeLimit));
        const currentPage = Math.min(totalPages, Math.max(1, requestedPage));
        const start = (currentPage - 1) * homeLimit;
        pagePosts = allHomepagePosts.slice(start, start + homeLimit);
      } else {
        pagePosts = allHomepagePosts.slice(0, homeLimit);
      }

      const firstTopic = await loadFirstTopicForPosts(pagePosts.map((p) => p.id));
      const recentPosts = pagePosts.map(
        (p): RecentPost => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          url: postUrl(p),
          publishedAt: p.publishedAt,
          featuredImage: p.featuredImage,
          excerpt: p.excerpt ?? p.seoDescription,
          topic: firstTopic.get(p.id) ?? null,
        }),
      );

      // Stash for resolveHomepageDisplay below (called after
      // displayDateFormat / displayTimezone are available).
      // HomepageMain reads exclusively from `metadata.homepageDisplay`
      // — do NOT write back into `postsGrid["topic:"]` here. Doing so
      // would clobber the all-posts bucket that sidebar PostsGrid
      // widgets (the ones with no explicit topic filter) read from,
      // forcing every empty-topic sidebar widget to mirror the
      // homepage's sliced + source-filtered list regardless of its
      // own settings.
      homepagePostsForDisplay = recentPosts;
    }
  }

  // When a post is in scope, fetch the post's author profile so the
  // PostMeta block can render the byline as a link to the author's
  // public profile page (`/author/<username>`) and surface fullName /
  // displayName based on its toggle. Fail soft — a deleted/missing
  // author just leaves PostMeta with no link.
  //
  // Same for pages: the AuthorMeta widget reads either `postAuthor`,
  // `pageAuthor`, or `author` (whichever the route populates) so it
  // works on single-post and single-page templates alike.
  const [postAuthor, pageAuthor, postAncestors] = await Promise.all([
    ctx.post?.createdBy ? getAuthorById(ctx.post.createdBy) : Promise.resolve(null),
    ctx.page?.createdBy ? getAuthorById(ctx.page.createdBy) : Promise.resolve(null),
    // Build the ancestor chain (root → leaf) for the current post by
    // walking parentId. Today the data model only allows pillar →
    // spike (one level), but the loop is depth-agnostic so an
    // additional layer ships transparently when the schema gets
    // there. Capped at 16 hops as cycle insurance.
    ctx.post ? buildPostAncestors(db(), ctx.post) : Promise.resolve([]),
  ]);

  // Display-format triple — site-wide preferences for date/time/timezone
  // that theme components (PostMeta, PostsGrid, HomepageMain, etc.) read
  // when rendering visible dates. Locale-pinned via @core/datetime so
  // server and client agree.
  const [displayDateFormat, displayTimeFormat, displayTimezone, siteTitleRaw, siteTaglineRaw, siteUrlResolved] = await Promise.all([
    getSetting<DateFormat>(db(), "site.date_format"),
    getSetting<TimeFormat>(db(), "site.time_format"),
    getSetting<string>(db(), "site.timezone"),
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
  ]);
  // Site identity tokens — exposed in metadata.site so widgets like
  // Text can resolve [title] / [site] / [tagline] / [url] shortcodes
  // without their own DB read.
  const site = {
    title: typeof siteTitleRaw === "string" ? siteTitleRaw : "",
    tagline: typeof siteTaglineRaw === "string" ? siteTaglineRaw : "",
    url: siteUrlResolved,
  };

  // Build the PostListOptions for the homepage main slot now that we have
  // the display-format triple. Undefined when kind === "page" or no posts.
  const homepageDisplay: PostListOptions | undefined = homepagePostsForDisplay
    ? await resolveHomepageDisplay({
        posts: homepagePostsForDisplay,
        totalCount: homepageTotalCount,
        searchParams: ctx.searchParams,
        routePath: ctx.routePath ?? "/",
        display: {
          dateFormat: displayDateFormat ?? DEFAULT_DATE_FORMAT,
          timezone: displayTimezone ?? DEFAULT_TIMEZONE,
        },
      })
    : undefined;

  // Theme container token surfaced to widgets that need to match the
  // page body width — most importantly the Mega Menu panel in
  // "container" widthMode, which otherwise hardcodes max-w-7xl.
  const themeContainerForMetadata = (() => {
    const cs = computeContainerStyle({
      mode: containerMode,
      preset: containerPreset,
      custom: containerCustom,
    });
    return cs.inlineStyle
      ? { className: cs.className, maxWidth: cs.inlineStyle.maxWidth }
      : { className: cs.className };
  })();

  const metadata = {
    galleries,
    media,
    menus,
    megaPanels,
    themeContainer: themeContainerForMetadata,
    postsGrid,
    newspaper,
    pillarsById,
    topicsBySlug,
    currentTopicSlug: ctx.topic?.slug,
    page: ctx.page,
    pageBody: ctx.pageBody,
    post: ctx.post,
    postAuthor,
    pageAuthor,
    postAncestors,
    postBody: ctx.postBody,
    postTopics: ctx.postTopics,
    topic: ctx.topic,
    homepageSource,
    homepageDisplay,
    author: ctx.author,
    searchQuery: ctx.searchQuery,
    searchPage: ctx.searchPage,
    postsPage: ctx.postsPage,
    routePath: ctx.routePath,
    searchResults: ctx.searchResults,
    themeLogoUrl,
    site,
    display: {
      dateFormat: displayDateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: displayTimeFormat ?? DEFAULT_TIME_FORMAT,
      timezone: displayTimezone ?? DEFAULT_TIMEZONE,
    },
  };

  // Plugins push render-time data into `metadata.plugins` via the
  // `theme.metadata` filter. See render-types.ts for the contract.
  // `trees` is threaded in alongside the route ctx so plugins can
  // walk the same flat tree list the engine uses for PostsGrid /
  // Newspaper spec collection — i.e., header / footer / sidebars /
  // template main.
  const bus = getBootBus();
  const themeMetadataCtx = {
    ...ctx,
    trees: [headerData, footerData, leftData, rightData, templateData] as const,
  };
  const pluginMetadata: Record<string, unknown> = bus
    ? await bus.applyFilters(
        "theme.metadata",
        {} as Record<string, unknown>,
        themeMetadataCtx,
      )
    : {};
  const metadataWithPlugins = { ...metadata, plugins: pluginMetadata };

  const wantLeft = showLeft !== false;
  const wantRight = showRight !== false;
  const hasLeft = wantLeft && (leftData.content?.length ?? 0) > 0;
  const hasRight = wantRight && (rightData.content?.length ?? 0) > 0;

  const grid = computeGridClasses({
    preset: columnPreset,
    hasLeft,
    hasRight,
    expandWhenNoSidebars: expandMainWhenNoSidebars,
  });

  const containerStyle = computeContainerStyle({
    mode: containerMode,
    preset: containerPreset,
    custom: containerCustom,
  });

  const containerClass = ["mx-auto w-full", containerStyle.className]
    .filter(Boolean)
    .join(" ");
  const containerInline = containerStyle.inlineStyle;

  // Header is now a single Puck zone — the editor composes its layout
  // (typically a Layout block in the 1/4 + 1/2 + 1/4 variant — Logo +
  // Menu + Search — but they can pick anything). The semantic
  // `<header>` element + chrome padding stay here so themes don't
  // have to reinvent them per save.
  // Shadow rides the `<header>` element directly (not the outer sticky
  // wrapper) so it traces the constrained content width — the
  // full-bleed edges band stays shadow-free even when one is set.
  // `relative` on the <header> turns it into the positioning ancestor for
  // descendant mega-menu panels (`position: absolute; left:50%; -translate-x-1/2;
  // width: 100vw`). Without this, the panel's positioning ancestor walks up
  // to whichever element first declares `position: relative` — typically the
  // <nav> inside a Layout column. When that nav lives in an off-center
  // column (e.g. the "max" track of a `max + auto` menu + search row), the
  // panel inherits the column's offset and lands shifted left of viewport.
  // The <header> itself is `mx-auto` via renderChromeSection's containerClass,
  // so its center == viewport center, so the 100vw panel lands edge-to-edge.
  const headerNode = (
    <header
      className={`np-site-header relative not-prose px-6 py-4 ${headerShadowClass}`.trim()}
    >
      <Render config={puckConfig} data={headerData} metadata={metadataWithPlugins} />
    </header>
  );
  const headerSectionInner = renderChromeSection({
    inner: headerNode,
    constrained: applyContainerToHeader,
    containerClass,
    containerInline,
    bgColor: headerBgColor,
    edgesColor: headerEdgesColor,
  });
  // Sticky header is a single chrome-wide pin — its z-index sits above
  // any sticky sidebar widget so the navigation always wins on overlap.
  // Per-breakpoint: emit the right Tailwind responsive class combo so
  // desktop and mobile sticky can be toggled independently. When both
  // are off we skip the wrapper entirely (byte-identical to the prior
  // non-sticky branch).
  const stickyClass = (() => {
    if (headerStickyDesktop && headerStickyMobile) return "sticky top-0 z-30";
    if (headerStickyDesktop) return "md:sticky md:top-0 md:z-30";
    if (headerStickyMobile) return "max-md:sticky max-md:top-0 max-md:z-30";
    return "";
  })();
  const headerSection = stickyClass ? (
    <div className={stickyClass}>{headerSectionInner}</div>
  ) : (
    headerSectionInner
  );

  // Footer is now a single Puck zone — the editor composes its layout
  // (typically a Layout block in the 1/4 + 1/2 + 1/4 variant, but they
  // can pick anything). Padding stays at the chrome wrapper so themes
  // and inner Layouts don't fight over breathing room.
  const footerInner = (
    <div className="np-site-footer not-prose px-6 py-8">
      <Render config={puckConfig} data={footerData} metadata={metadataWithPlugins} />
    </div>
  );
  const footerSection = renderChromeSection({
    inner: footerInner,
    constrained: applyContainerToFooter,
    containerClass,
    containerInline,
    bgColor: footerBgColor,
    edgesColor: footerEdgesColor,
  });

  // The body is a two-layer section just like header/footer, but its
  // outer wrapper carries `flex-1` (rather than the inner) so the body
  // stretches to push the footer to the bottom of the viewport. The
  // inner picks up `flex-1 flex flex-col` instead so the grid still
  // grows to fill the outer when the body has little content.
  const bodyInnerStyle: React.CSSProperties = {
    ...(containerInline ?? {}),
    ...(bodyBgColor ? { backgroundColor: bodyBgColor } : {}),
  };
  const hasBodyInnerStyle = Object.keys(bodyInnerStyle).length > 0;
  const bodyContent = (
    <div
      className={`flex-1 ${containerClass} px-4 py-8 lg:grid ${grid.gridColsClass} lg:gap-8`}
      style={hasBodyInnerStyle ? bodyInnerStyle : undefined}
    >
      {hasLeft ? (
        <aside className={`np-sidebar np-sidebar-left ${grid.sidebarColSpanClass} hidden lg:block`}>
          <Render config={puckConfig} data={leftData} metadata={metadataWithPlugins} />
        </aside>
      ) : null}

      <main className={`np-main ${grid.mainColSpanClass} prose prose-slate max-w-none`}>
        <Render config={puckConfig} data={templateData} metadata={metadataWithPlugins} />
      </main>

      {hasRight ? (
        <aside className={`np-sidebar np-sidebar-right ${grid.sidebarColSpanClass} hidden lg:block`}>
          <Render config={puckConfig} data={rightData} metadata={metadataWithPlugins} />
        </aside>
      ) : null}
    </div>
  );
  const bodySection = bodyEdgesColor ? (
    <div
      className="flex flex-1 flex-col"
      style={{ backgroundColor: bodyEdgesColor }}
    >
      {bodyContent}
    </div>
  ) : (
    bodyContent
  );

  const body = (
    <div className="np-public min-h-screen flex flex-col">
      {headerSection}
      {bodySection}
      {footerSection}
      {/* Page-level bootstrapper for the Table of Contents widget,
          which mounts via direct DOM scraping rather than through
          Puck's `<Render>`. Lives OUTSIDE the Puck-rendered subtree
          so the "use client" boundary is honoured by Next's standard
          pipeline (no interaction with Puck's RSC bundle, which
          destabilises hook dispatchers along its render path). The
          mounter renders nothing visible — it scans for
          `[data-np-toc]` placeholders on mount and builds each TOC
          via DOM manipulation.
          NB: the parallel `ImageLightboxMounter` is mounted from the
          public route pages instead (alongside `DisableRightClick`).
          That mounter imports `yet-another-react-lightbox/styles.css`,
          and importing it through this server file pulls the CSS
          into the `tsx`-driven migrate import graph at build time —
          tsx can't parse CSS. */}
      <TableOfContentsMounter />
      {/* Page-level bootstrapper for the Sticky Container widget —
          same pattern, same reason. Wires the scroll watcher in a
          `useEffect` so DOM mutations land after React hydration. */}
      <StickyContainerMounter />
      {/* Page-level bootstrapper for Newspaper widgets (Section prev/next
          arrows + Section Hero / Section Featured tab strips). Scans for
          `[data-np-newspaper-widget]` and wires click handlers + fetch
          calls in a `useEffect` after hydration. */}
      <NewspaperWidgetsMounter />
    </div>
  );

  const head = (
    <>
      <link rel="stylesheet" href={`/api/themes/${slug}/styles/theme.css`} />
      <link rel="stylesheet" href={`/api/themes/${slug}/tokens.css`} />
      <link rel="stylesheet" href={`/api/themes/${slug}/user-overrides.css`} />
      {faviconUrl ? (
        <link rel="icon" type={faviconType} href={faviconUrl} />
      ) : null}
    </>
  );

  return { themeSlug: slug, body, head };
}
