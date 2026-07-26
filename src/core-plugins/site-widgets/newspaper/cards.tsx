import ReactDOM from "react-dom";
import type { NewspaperPost } from "./types";
import {
  formatDate,
  parseSqliteUtc,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
} from "@core/datetime";
import { toFeaturedThumbVariant, toFeaturedMediumVariant } from "@core-plugins/media/storage/url";

export type NewspaperDisplayStyle = "overlays" | "cards";

export interface CardCommonProps {
  post: NewspaperPost;
  showDate: boolean;
  showAuthor: boolean;
  showTopic: boolean;
  showExcerpt?: boolean;
  dateFormat?: DateFormat;
  timezone?: string;
  overlayClass?: string;   // "" = no overlay
  overlayIsDark?: boolean; // controls text color (undefined treated as true)
  // `"overlays"` keeps the historic look (title + meta painted on top of
  // the image via a dark gradient). `"cards"` renders a plain image with
  // the title, topic chip and byline in a text block UNDER the image —
  // a more traditional magazine card layout. NewspaperHero's featured
  // slot ignores this prop and always renders the overlay variant.
  displayStyle?: NewspaperDisplayStyle;
}

function fmtDate(
  publishedAt: string | null,
  format: DateFormat = DEFAULT_DATE_FORMAT,
  tz: string = DEFAULT_TIMEZONE,
): string | null {
  if (!publishedAt) return null;
  return formatDate(parseSqliteUtc(publishedAt), format, tz);
}

function TopicChipOverlay({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center bg-slate-900/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ letterSpacing: "0.05em" }}
    >
      {name}
    </span>
  );
}

// Topic chip variant for the "cards" display style — sits in a text
// block below the image, so it doesn't need the dark background that
// the overlay variant uses for contrast over arbitrary photos.
function TopicChipUnderCard({ name }: { name: string }) {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide text-brand-green"
      style={{ letterSpacing: "0.05em" }}
    >
      {name}
    </span>
  );
}

/**
 * Featured card — large image with overlaid title on a dark gradient.
 * `size` controls intrinsic aspect + typography density:
 *   - "hero":   the dominant card in Newspaper Hero (left side, ~4:3 tall)
 *   - "large":  Section Hero / Section Featured featured cards
 *   - "medium": Section Featured's second featured slot
 */
export function NewspaperFeaturedCard({
  post,
  showDate,
  showAuthor,
  showTopic,
  showExcerpt,
  size,
  aspectOverride,
  dateFormat,
  timezone,
  overlayClass,
  overlayIsDark,
  displayStyle,
  eagerImage,
}: CardCommonProps & {
  size: "hero" | "large" | "medium";
  // Optional aspect override — accepted as a CSS `aspect-ratio` value
  // (e.g. "16 / 9") and applied as inline style. Stacked Newspaper Hero
  // passes "16 / 9" so the featured card is wide rather than the
  // default 4:3. Inline style sidesteps Tailwind's JIT purge — an
  // arbitrary `aspect-[${var}]` class would otherwise be stripped at
  // build time.
  aspectOverride?: string;
  // The section that owns the page's lead image (Newspaper Section Hero)
  // sets this so its `size="large"` featured card loads eagerly with high
  // priority — it's the LCP element / above the fold. Featured cards in
  // lower sections leave it unset and lazy-load.
  eagerImage?: boolean;
}) {
  const aspectClass = aspectOverride
    ? ""
    : size === "hero"
      ? "aspect-[4/3]"
      : size === "large"
        ? "aspect-[16/10]"
        : "aspect-[16/10]";
  const aspectStyle: React.CSSProperties | undefined = aspectOverride
    ? { aspectRatio: aspectOverride }
    : undefined;
  const titleClass =
    size === "hero"
      ? "text-3xl font-bold leading-tight"
      : size === "large"
        ? "text-xl md:text-2xl font-bold leading-tight"
        : "text-md md:text-xl font-semibold leading-tight";
  const dateLabel = showDate ? fmtDate(post.publishedAt, dateFormat, timezone) : null;

  // The hero-size featured card (and any card the section explicitly marks
  // via `eagerImage`) is the above-the-fold lead — its image is the page's
  // LCP element, so it loads eagerly with high priority. All other featured
  // cards sit lower in sections and lazy-load like grid cards.
  const isPriority = size === "hero" || eagerImage === true;
  const imgLoading = isPriority ? "eager" : "lazy";
  const imgPriority = isPriority ? "high" : undefined;
  // Featured cards are prominent — serve the ≤1280px WebP medium variant
  // instead of the full-resolution original (falls back to original safely).
  const cardImg = toFeaturedMediumVariant(post.featuredImage) ?? post.featuredImage ?? undefined;

  // The priority (above-the-fold lead) card holds the page's LCP image. Emit a
  // high-priority image preload so the browser starts fetching it during the
  // initial HTML parse — before it reaches this widget's markup. `ReactDOM.preload`
  // (React 19) hoists a `<link rel="preload" as="image">` into `<head>` and
  // dedupes by href, so rendering it here is safe even if called more than once.
  if (isPriority && cardImg) {
    ReactDOM.preload(cardImg, { as: "image", fetchPriority: "high" });
  }

  if (displayStyle === "cards") {
    // "Cards" mode: plain image on top, text block below. The text
    // block lives on a white card body so the layout stays readable
    // regardless of the image content — no overlay tinting needed.
    // `overflow-hidden` on the image wrapper itself (not just the card)
    // keeps the hover `scale-105` zoom clipped at the wrapper's exact
    // aspect-ratio box, so the bottom of the image doesn't push past
    // the divider into the text block on hover.
    return (
      <a
        href={post.url}
        className="np-newspaper-featured-card np-newspaper-featured-card--cards group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className={`relative ${aspectClass} overflow-hidden bg-slate-200`} style={aspectStyle}>
          {post.featuredImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardImg}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading={imgLoading}
              fetchPriority={imgPriority}
            />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-5 md:p-6 text-brand-navy">
          {showTopic && post.topic ? (
            <div className="mb-2">
              <TopicChipUnderCard name={post.topic.name} />
            </div>
          ) : null}
          <h2 className={titleClass}>{post.title}</h2>
          {showExcerpt && post.excerpt ? (
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{post.excerpt}</p>
          ) : null}
          {(showAuthor && post.authorName) || dateLabel ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              {showAuthor && post.authorName ? (
                <span className="font-semibold text-slate-900">{post.authorName}</span>
              ) : null}
              {showAuthor && post.authorName && dateLabel ? <span aria-hidden>-</span> : null}
              {dateLabel ? <span>{dateLabel}</span> : null}
            </div>
          ) : null}
        </div>
      </a>
    );
  }

  const isDark = overlayIsDark !== false;
  const textClass = isDark ? "text-white" : "text-brand-navy";
  const bylineClass = isDark ? "text-white/85" : "text-brand-navy/80";
  return (
    <a
      href={post.url}
      className={`np-newspaper-featured-card group relative block overflow-hidden rounded-lg border border-slate-200 ${aspectClass} bg-slate-200`}
      style={aspectStyle}
    >
      {post.featuredImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cardImg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading={imgLoading}
          fetchPriority={imgPriority}
        />
      ) : null}
      {overlayClass ? <div className={`absolute inset-0 ${overlayClass}`} /> : null}
      <div className={`absolute inset-0 flex flex-col justify-end p-5 md:p-6 ${textClass}`}>
        {showTopic && post.topic ? (
          <div className="mb-3">
            <TopicChipOverlay name={post.topic.name} />
          </div>
        ) : null}
        <h2 className={titleClass}>{post.title}</h2>
        {showExcerpt && post.excerpt ? (
          <p className="mt-1 line-clamp-2 text-sm">{post.excerpt}</p>
        ) : null}
        {(showAuthor && post.authorName) || dateLabel ? (
          <div className={`mt-3 flex items-center gap-2 text-sm ${bylineClass}`}>
            {showAuthor && post.authorName ? (
              <span className="font-semibold">{post.authorName}</span>
            ) : null}
            {showAuthor && post.authorName && dateLabel ? <span aria-hidden>-</span> : null}
            {dateLabel ? <span>{dateLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </a>
  );
}

/**
 * Small overlaid card — tile with topic chip + title on a dark gradient.
 * Used by Newspaper Hero (slots 1..N) and Newspaper Section (3 horizontal cards).
 */
export function NewspaperSmallCard({
  post,
  showDate,
  showAuthor,
  showTopic,
  showExcerpt,
  aspect,
  dateFormat,
  timezone,
  overlayClass,
  overlayIsDark,
  displayStyle,
}: CardCommonProps & { aspect: "rectangle" | "square" | "fill" }) {
  const aspectClass =
    aspect === "rectangle"
      ? "aspect-[16/10]"
      : aspect === "square"
        ? "aspect-square"
        : "aspect-[16/10] w-full md:aspect-auto md:h-full";
  const dateLabel = showDate ? fmtDate(post.publishedAt, dateFormat, timezone) : null;
  // Small grid cards are never the LCP element — serve the 600px WebP thumb
  // (never the full-size original) and lazy-load below the fold.
  const cardImg = toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage ?? undefined;

  if (displayStyle === "cards") {
    // "Cards" mode: plain image at top, text block underneath.
    // `overflow-hidden` on the image wrapper itself clips hover `scale`
    // at the wrapper box so the zoom never pushes into the text block.
    // The "fill" aspect token only makes sense for the overlay variant
    // (where the absolutely-positioned text doesn't add height). Cards
    // mode falls back to "rectangle" so the layout stays predictable.
    const imageAspectClass =
      aspect === "square" ? "aspect-square" : "aspect-[16/10]";
    return (
      <a
        href={post.url}
        className="np-newspaper-small-card np-newspaper-small-card--cards group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className={`relative ${imageAspectClass} overflow-hidden bg-slate-200`}>
          {post.featuredImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardImg}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-4 text-brand-navy">
          {showTopic && post.topic ? (
            <div className="mb-1">
              <TopicChipUnderCard name={post.topic.name} />
            </div>
          ) : null}
          <h3 className="text-base font-semibold leading-snug md:text-md">{post.title}</h3>
          {showExcerpt && post.excerpt ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.excerpt}</p>
          ) : null}
          {(showAuthor && post.authorName) || dateLabel ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              {showAuthor && post.authorName ? <span>{post.authorName}</span> : null}
              {showAuthor && post.authorName && dateLabel ? <span aria-hidden>-</span> : null}
              {dateLabel ? <span>{dateLabel}</span> : null}
            </div>
          ) : null}
        </div>
      </a>
    );
  }

  const isDark = overlayIsDark !== false;
  const textClass = isDark ? "text-white" : "text-brand-navy";
  const bylineClass = isDark ? "text-white/80" : "text-brand-navy/80";
  return (
    <a
      href={post.url}
      className={`np-newspaper-small-card group relative block overflow-hidden rounded-lg border border-slate-200 ${aspectClass} bg-slate-200`}
    >
      {post.featuredImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cardImg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : null}
      {overlayClass ? <div className={`absolute inset-0 ${overlayClass}`} /> : null}
      <div className={`absolute inset-0 flex flex-col justify-end p-4 ${textClass}`}>
        {showTopic && post.topic ? (
          <div className="mb-2">
            <TopicChipOverlay name={post.topic.name} />
          </div>
        ) : null}
        <h3 className="text-base font-semibold leading-snug md:text-md">{post.title}</h3>
        {showExcerpt && post.excerpt ? (
          <p className={`mt-1 line-clamp-2 text-xs ${bylineClass}`}>{post.excerpt}</p>
        ) : null}
        {(showAuthor && post.authorName) || dateLabel ? (
          <div className={`mt-2 flex items-center gap-2 text-xs ${bylineClass}`}>
            {showAuthor && post.authorName ? <span>{post.authorName}</span> : null}
            {showAuthor && post.authorName && dateLabel ? <span aria-hidden>-</span> : null}
            {dateLabel ? <span>{dateLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </a>
  );
}

/**
 * List row — small thumbnail on left + title + date on right.
 * Used by Section Hero (right column, 4 rows) and Section Featured
 * (bottom 2x2 grid).
 */
export function NewspaperListRow({
  post,
  showDate,
  showAuthor,
  showTopic,
  showExcerpt,
  dateFormat,
  timezone,
}: CardCommonProps) {
  const dateLabel = showDate ? fmtDate(post.publishedAt, dateFormat, timezone) : null;
  return (
    <a
      href={post.url}
      className="np-newspaper-list-row group flex items-start gap-2 rounded-md p-2 transition hover:bg-slate-50"
    >
      <div className="size-15 shrink-0 overflow-hidden rounded bg-slate-100">
        {post.featuredImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage}
            alt=""
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        {showTopic && post.topic ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {post.topic.name}
          </div>
        ) : null}
        <h3 className="text-base font-semibold leading-snug text-slate-900 group-hover:text-brand-green">
          {post.title}
        </h3>
        {showExcerpt && post.excerpt ? (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.excerpt}</p>
        ) : null}
        {(showAuthor && post.authorName) || dateLabel ? (
          <div className="mt-1 text-xs text-slate-500">
            {showAuthor && post.authorName ? <span>{post.authorName}</span> : null}
            {showAuthor && post.authorName && dateLabel ? (
              <span aria-hidden> - </span>
            ) : null}
            {dateLabel ? <span>{dateLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </a>
  );
}
