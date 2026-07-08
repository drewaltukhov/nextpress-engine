/**
 * PostListView — shared presentational primitive for rendering a list of posts.
 *
 * Owns three layout renderers (list / grid / plain) and the card/row
 * primitives. PostsGrid delegates to this (Task 4); HomepageMain uses it
 * via metadata.homepageDisplay (Task 7).
 *
 * Pure presentational — no puck.metadata reads, no settings calls, no server
 * actions. All data arrives via `PostListOptions`.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  formatDate,
  parseSqliteUtc,
  type DateFormat,
} from "@core/datetime";
import { toFeaturedThumbVariant } from "@core-plugins/media/storage/url";
import {
  Pagination,
} from "./Pagination";

/** Width of the right-edge gutter the CustomScrollAreaMounter draws
 *  the overlay track + thumb into. Must match `GUTTER_WIDTH` in
 *  `CustomScrollArea.tsx` (the mounter) so the host's padding-right
 *  clears the same column the overlay paints. */
const SCROLL_GUTTER_PX = 16;

// ---------------------------------------------------------------------------
// Shared types (exported so consumers import from one place)
// ---------------------------------------------------------------------------

export interface PostTopic {
  id: number;
  name: string;
  slug: string;
}

export interface RecentPost {
  id: number;
  title: string;
  slug: string;
  url: string;
  publishedAt: string | null;
  featuredImage: string | null;
  /** Two-line excerpt for the "plain" list layout. Mapped from
   *  `seoDescription` on the underlying post. Null when missing. */
  excerpt: string | null;
  topic: PostTopic | null;
}

export interface PostListPagination {
  currentPage: number;
  totalPages: number;
  /** Build the URL for a given page number. */
  linkFor: (page: number) => string;
  style: "numbered" | "arrows";
  type: "buttons" | "links";
  align: "left" | "center" | "right";
}

export type ListThumbnailSize = "small" | "medium" | "big";

/** "limit" caps the rendered list at `limit` items (legacy behavior).
 *  "wrap" renders every supplied item inside a fixed-height scroll
 *  container sized to ~`limit` visible rows — mirrors the original
 *  scrolling `<ul class="scroll-menu">` sidebar pattern.
 *  Wrap mode is grid-layout-incompatible and is silently ignored when
 *  pagination is on (PostsGrid hides the field in those cases). */
export type PostListLimitMode = "limit" | "wrap";

export interface PostListOptions {
  posts: RecentPost[];
  layout: "list" | "grid" | "plain";
  limit: number;
  /** Defaults to "limit" when unset — preserves legacy behavior for
   *  consumers that don't pass the field. */
  limitMode?: PostListLimitMode;
  /** Wrap-mode only — "default" yields the browser-native scrollbar;
   *  "custom" applies the `.np-scroll-custom` rules in globals.css
   *  (thin centered line + rounded thumb), with colors fed in through
   *  the next two fields as CSS variables on the `<ul>`. */
  wrapScrollerStyle?: "default" | "custom";
  wrapScrollerTrackColor?: string;
  wrapScrollerThumbColor?: string;
  showThumbnail: boolean;
  showTopic: boolean;
  /** Defaults to true when unset — preserves legacy behavior where the
   *  published-at line always rendered. */
  showDate?: boolean;
  showExcerpt?: boolean;
  gridColumns: 1 | 2 | 3 | 4;
  gridAspect: "rectangle" | "square";
  /** "grid" layout only — when true, the card image zooms in
   *  slightly while the card is hovered. */
  gridZoomOnHover?: boolean;
  /** "list" layout only — controls the thumbnail size. Ignored by
   *  grid (card hero) and plain (fixed size). Defaults to "big". */
  listThumbnailSize?: ListThumbnailSize;
  /** "list" layout only — when set, draws a 1px divider between rows
   *  in this hex color. Null / undefined = no dividers (default). */
  listSeparatorColor?: string | null;
  pagination: PostListPagination | null;
  display: { dateFormat: DateFormat; timezone: string };
}

// ---------------------------------------------------------------------------
// Layout constants
// Tailwind purge sees each class as a literal string, so look-up tables
// keep `grid-cols-{n}` and `aspect-{name}` visible to the scanner.
// ---------------------------------------------------------------------------

const GRID_COLS_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

const GRID_ASPECT_CLASS: Record<"rectangle" | "square", string> = {
  rectangle: "aspect-video",
  square: "aspect-square",
};

/** "list" layout thumbnail sizing. Tailwind keeps these classes alive
 *  because they appear as literal strings in this table. */
const LIST_THUMB_CLASS: Record<ListThumbnailSize, string> = {
  small: "size-10",
  medium: "size-14",
  big: "size-20",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postDateLabel(
  publishedAt: string | null | undefined,
  dateFormat: DateFormat,
  timezone: string,
): string | null {
  if (!publishedAt) return null;
  return formatDate(parseSqliteUtc(publishedAt), dateFormat, timezone);
}

/** Rough per-row height (px) used to compute the wrap-mode scroll
 *  container's max-height. Numbers are approximations of the rendered
 *  row + vertical gap — the goal is "~N items visible before scrolling
 *  kicks in," not pixel-perfect alignment. */
function estimateRowHeightPx(
  layout: PostListOptions["layout"],
  showThumbnail: boolean,
  thumbSize: ListThumbnailSize,
): number {
  if (layout === "plain") return 112;
  // list layout
  if (!showThumbnail) return 44;
  switch (thumbSize) {
    case "small":
      return 56;
    case "medium":
      return 72;
    case "big":
    default:
      return 96;
  }
}

// ---------------------------------------------------------------------------
// Card / row primitives (visually identical to PostsGrid's inline versions)
// ---------------------------------------------------------------------------

function TopicChip({ topic }: { topic: PostTopic }) {
  return (
    <span className="inline-flex max-w-fit items-center rounded bg-brand-light-green px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy">
      {topic.name}
    </span>
  );
}

function PostListRow({
  post,
  showThumbnail,
  showTopic,
  showExcerpt,
  dateLabel,
  thumbSize,
  separatorColor,
}: {
  post: RecentPost;
  showThumbnail: boolean;
  showTopic: boolean;
  showExcerpt: boolean;
  dateLabel: string | null;
  thumbSize: ListThumbnailSize;
  /** When non-null, render a top divider in this color (skip on the
   *  first row — the consumer passes null for that). */
  separatorColor: string | null;
}) {
  return (
    <li
      className={separatorColor ? "pt-2" : ""}
      style={separatorColor ? { borderTop: `1px solid ${separatorColor}` } : undefined}
    >
      <a
        href={post.url}
        className="flex items-start gap-3 rounded-md p-2 transition hover:bg-slate-50"
      >
        {showThumbnail ? (
          <div className={`${LIST_THUMB_CLASS[thumbSize]} shrink-0 overflow-hidden rounded bg-slate-100`}>
            {post.featuredImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage}
                alt=""
                className="h-full w-full object-cover object-center"
              />
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {showTopic && post.topic ? (
            <div className="mb-1">
              <TopicChip topic={post.topic} />
            </div>
          ) : null}
          <div className="text-base font-medium text-slate-900 md:text-sm">{post.title}</div>
          {showExcerpt && post.excerpt ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 md:text-xs">{post.excerpt}</p>
          ) : null}
          {dateLabel ? (
            <div className="text-sm text-slate-500 md:text-xs">{dateLabel}</div>
          ) : null}
        </div>
      </a>
    </li>
  );
}

/** Vertically-stacked rows in a single bordered card with row
 *  dividers — matches the SearchResults layout. Larger thumbnail
 *  than the compact "list" variant, and shows the post excerpt
 *  (mapped from `seoDescription`) when available. */
function PostPlainRow({
  post,
  showThumbnail,
  showTopic,
  showExcerpt,
  dateLabel,
}: {
  post: RecentPost;
  showThumbnail: boolean;
  showTopic: boolean;
  showExcerpt: boolean;
  dateLabel: string | null;
}) {
  return (
    <li>
      <a href={post.url} className="flex items-start gap-4 p-4 transition hover:bg-slate-50">
        {showThumbnail ? (
          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
            {post.featuredImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage}
                alt=""
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {/* Mobile (<md): chip + date on line 1, title on line 2.
              Excerpt is dropped on mobile to keep the row compact. */}
          <div className="flex flex-col gap-1 md:hidden">
            {(showTopic && post.topic) || dateLabel ? (
              <div className="flex items-center gap-2">
                {showTopic && post.topic ? <TopicChip topic={post.topic} /> : null}
                {dateLabel ? (
                  <span className="text-xs text-slate-400">{dateLabel}</span>
                ) : null}
              </div>
            ) : null}
            <h2 className="text-base font-medium text-slate-900">{post.title}</h2>
          </div>

          {/* Desktop (md+): original layout — chip + title inline,
              excerpt, then date below. */}
          <div className="hidden md:block">
            <div className="flex items-center gap-4">
              {showTopic && post.topic ? <TopicChip topic={post.topic} /> : null}
              <h2 className="text-base font-medium text-slate-900">{post.title}</h2>
            </div>
            {showExcerpt && post.excerpt ? (
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{post.excerpt}</p>
            ) : null}
            {dateLabel ? (
              <p className="mt-1 text-xs text-slate-400">{dateLabel}</p>
            ) : null}
          </div>
        </div>
      </a>
    </li>
  );
}

function PostCard({
  post,
  aspectClass,
  showTopic,
  showExcerpt,
  dateLabel,
  zoomOnHover,
}: {
  post: RecentPost;
  aspectClass: string;
  showTopic: boolean;
  showExcerpt: boolean;
  dateLabel: string | null;
  zoomOnHover: boolean;
}) {
  // Tailwind `group` propagates the card-hover state down to the
  // image so the scale-up only fires alongside the shadow lift on the
  // card itself, not on a hover anywhere over the image.
  return (
    <li className={`${zoomOnHover ? "group " : ""}overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow duration-150 hover:shadow-md`}>
      <a href={post.url} className="block">
        {post.featuredImage ? (
          <div className={`${aspectClass} w-full overflow-hidden bg-slate-100`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage}
              alt=""
              className={`h-full w-full object-cover object-center transition-transform duration-300 ease-out${zoomOnHover ? " group-hover:scale-105" : ""}`}
            />
          </div>
        ) : null}
        <div className="p-3">
          {showTopic && post.topic ? (
            <div className="mb-1">
              <TopicChip topic={post.topic} />
            </div>
          ) : null}
          <div className="text-sm font-medium text-slate-900">{post.title}</div>
          {showExcerpt && post.excerpt ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.excerpt}</p>
          ) : null}
          {dateLabel ? (
            <div className="mt-0.5 text-xs text-slate-500">{dateLabel}</div>
          ) : null}
        </div>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PostListView(opts: PostListOptions): ReactNode {
  const {
    posts,
    layout,
    limit,
    showThumbnail,
    showTopic,
    showExcerpt = false,
    gridColumns,
    gridAspect,
    pagination,
    display,
  } = opts;

  const safeLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(50, Math.max(1, Math.floor(limit)))
      : 5;

  const showDate = opts.showDate !== false;
  // Wrap mode is only meaningful for vertical layouts (list / plain) and
  // when pagination is off — both because pagination already solves the
  // "long list" UX and because slicing items into pages would defeat the
  // purpose of the inline scroller. Fall back to limit mode otherwise.
  const limitMode: PostListLimitMode =
    opts.limitMode === "wrap" && layout !== "grid" && pagination === null
      ? "wrap"
      : "limit";
  const items = limitMode === "wrap" ? posts : posts.slice(0, safeLimit);

  if (items.length === 0) {
    return (
      <section className="not-prose mb-4" data-np-toc-skip="">
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-400">
          No posts yet.
        </p>
      </section>
    );
  }

  // Wrap container: cap height at ~safeLimit rows so the scrollbar
  // engages once the user has more posts than the configured "visible
  // count." Estimated row heights live in `estimateRowHeightPx` and
  // intentionally over-shoot a touch so the last visible row isn't
  // half-cut by the container edge.
  const wrapMaxHeightPx =
    limitMode === "wrap"
      ? safeLimit *
          estimateRowHeightPx(layout, showThumbnail, opts.listThumbnailSize ?? "big") +
        8
      : null;
  const wrapCustom = limitMode === "wrap" && opts.wrapScrollerStyle === "custom";
  // CSS variables read by `.np-scroll-custom` in globals.css. Passing
  // them inline keeps each widget instance self-contained — no
  // per-instance stylesheet, no class-name collisions.
  const wrapStyle: CSSProperties | undefined = wrapMaxHeightPx
    ? {
        maxHeight: `${wrapMaxHeightPx}px`,
        overflowY: "auto",
        ...(wrapCustom
          ? ({
              "--np-scroll-track": opts.wrapScrollerTrackColor ?? "#e2e8f0",
              "--np-scroll-thumb": opts.wrapScrollerThumbColor ?? "#94a3b8",
            } as CSSProperties)
          : {}),
      }
    : undefined;
  const wrapClass = wrapMaxHeightPx
    ? `np-posts-scroll${wrapCustom ? " np-scroll-custom" : ""}`
    : "";

  return (
    <section className="not-prose mb-4" data-np-toc-skip="">
      {layout === "grid" ? (
        <ul className={`grid gap-3 ${GRID_COLS_CLASS[gridColumns]}`}>
          {items.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              aspectClass={GRID_ASPECT_CLASS[gridAspect]}
              showTopic={showTopic}
              showExcerpt={showExcerpt}
              dateLabel={showDate ? postDateLabel(p.publishedAt, display.dateFormat, display.timezone) : null}
              zoomOnHover={opts.gridZoomOnHover !== false}
            />
          ))}
        </ul>
      ) : layout === "plain" ? (
        wrapCustom && wrapMaxHeightPx ? (
          // Static placeholder picked up by `CustomScrollAreaMounter`.
          // The mounter (mounted once per route in render.tsx) reads
          // the data-attrs, hides the native scrollbar, and injects a
          // 1px track + circle thumb as DOM siblings of the host UL.
          <div
            className="np-scroll-overlay"
            style={{ position: "relative", maxHeight: `${wrapMaxHeightPx}px` }}
          >
            <ul
              data-np-scroll-host=""
              data-np-scroll-track={opts.wrapScrollerTrackColor ?? "#e2e8f0"}
              data-np-scroll-thumb={opts.wrapScrollerThumbColor ?? "#94a3b8"}
              className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white np-scrollbar-hidden"
              style={{
                maxHeight: `${wrapMaxHeightPx}px`,
                overflowY: "auto",
                paddingRight: `${SCROLL_GUTTER_PX}px`,
              }}
            >
              {items.map((p) => (
                <PostPlainRow
                  key={p.id}
                  post={p}
                  showThumbnail={showThumbnail}
                  showTopic={showTopic}
                  showExcerpt={showExcerpt}
                  dateLabel={showDate ? postDateLabel(p.publishedAt, display.dateFormat, display.timezone) : null}
                />
              ))}
            </ul>
          </div>
        ) : (
          <ul
            className={`divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white ${wrapClass}`.trim()}
            style={wrapStyle}
          >
            {items.map((p) => (
              <PostPlainRow
                key={p.id}
                post={p}
                showThumbnail={showThumbnail}
                showTopic={showTopic}
                showExcerpt={showExcerpt}
                dateLabel={showDate ? postDateLabel(p.publishedAt, display.dateFormat, display.timezone) : null}
              />
            ))}
          </ul>
        )
      ) : wrapCustom && wrapMaxHeightPx ? (
        <div
          className="np-scroll-overlay"
          style={{ position: "relative", maxHeight: `${wrapMaxHeightPx}px` }}
        >
          <ul
            data-np-scroll-host=""
            data-np-scroll-track={opts.wrapScrollerTrackColor ?? "#e2e8f0"}
            data-np-scroll-thumb={opts.wrapScrollerThumbColor ?? "#94a3b8"}
            className="space-y-2 np-scrollbar-hidden"
            style={{
              maxHeight: `${wrapMaxHeightPx}px`,
              overflowY: "auto",
              paddingRight: `${SCROLL_GUTTER_PX}px`,
            }}
          >
            {items.map((p, i) => (
              <PostListRow
                key={p.id}
                post={p}
                showThumbnail={showThumbnail}
                showTopic={showTopic}
                showExcerpt={showExcerpt}
                dateLabel={showDate ? postDateLabel(p.publishedAt, display.dateFormat, display.timezone) : null}
                thumbSize={opts.listThumbnailSize ?? "big"}
                separatorColor={opts.listSeparatorColor && i > 0 ? opts.listSeparatorColor : null}
              />
            ))}
          </ul>
        </div>
      ) : (
        <ul className={`space-y-2 ${wrapClass}`.trim()} style={wrapStyle}>
          {items.map((p, i) => (
            <PostListRow
              key={p.id}
              post={p}
              showThumbnail={showThumbnail}
              showTopic={showTopic}
              showExcerpt={showExcerpt}
              dateLabel={showDate ? postDateLabel(p.publishedAt, display.dateFormat, display.timezone) : null}
              thumbSize={opts.listThumbnailSize ?? "big"}
              separatorColor={opts.listSeparatorColor && i > 0 ? opts.listSeparatorColor : null}
            />
          ))}
        </ul>
      )}
      {pagination !== null && pagination.totalPages > 1 ? (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          linkFor={pagination.linkFor}
          style={pagination.style}
          type={pagination.type}
          align={pagination.align}
        />
      ) : null}
    </section>
  );
}
