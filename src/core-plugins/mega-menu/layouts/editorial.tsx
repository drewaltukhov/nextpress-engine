import Link from "next/link";
import type { DbClient } from "@core/db/client";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import type { LayoutDef } from "./types";

export interface EditorialConfig {
  /** Small uppercase eyebrow above the featured post (left column). */
  eyebrowFeatured: string;
  /** Eyebrow above the recent-posts grid (right column). */
  eyebrowRecent: string;
  /** Manually pick a featured post by id; falls back to "most recent
   *  with image" when null. */
  featuredPostId: number | null;
  /** How many posts to show in the right-side grid (excluding the
   *  featured post). Range 2–10. */
  recentLimit: number;
  /** Restrict the right-side grid to spikes hanging off these pillar
   *  ids. Empty = no pillar filter. The most useful filter for the
   *  typical mega-menu shape, where each top-level item IS a pillar. */
  recentPillarIds: number[];
  /** Restrict the right-side grid to posts in these topic ids. Empty =
   *  no topic filter. AND-combines with `recentPillarIds` when both
   *  are set. */
  recentTopicIds: number[];
  /** Right-side grid style:
   *    - "list":  small thumb + title (current default).
   *    - "cards": tile with thumbnail-on-top + title below. */
  recentStyle: "list" | "cards";
  /** Cards-only — thumbnail aspect ratio. Ignored in list style.
   *    - "rectangle": 4/3 (default — slightly tall, magazine feel).
   *    - "wide":      16/9 (cinematic / video-friendly).
   *    - "square":    1/1. */
  cardAspect: "rectangle" | "wide" | "square";
  /** List-only: show small thumbnails next to each row. Ignored in cards
   *  style (cards always show their thumbnail — it's the whole point).
   *  The featured post's hero image is always visible regardless. */
  showThumbnails: boolean;
  /** Show the published date under each recent post. */
  showDates: boolean;
  /** Show the post excerpt under the **featured** post title (2-line
   *  clamp). Defaults true to preserve the original always-show behavior. */
  showFeaturedExcerpt: boolean;
  /** Show the post excerpt under each **recent** post title — applies to
   *  both list and cards mode (2-line clamp). Defaults true. */
  showRecentExcerpts: boolean;
  /** List-only: 1px separator lines between rows. Ignored in cards
   *  style (tiles have natural visual separation). */
  showSeparators: boolean;
  /** Optional CTA link rendered below the right grid. */
  cta: { label: string; href: string; target: "_self" | "_blank" } | null;
}

const DEFAULT: EditorialConfig = {
  eyebrowFeatured: "Featured",
  eyebrowRecent: "Latest posts",
  featuredPostId: null,
  recentLimit: 6,
  recentPillarIds: [],
  recentTopicIds: [],
  recentStyle: "list",
  cardAspect: "rectangle",
  showThumbnails: true,
  showDates: false,
  showFeaturedExcerpt: true,
  showRecentExcerpts: true,
  showSeparators: false,
  cta: null,
};

function parseConfig(raw: unknown): EditorialConfig {
  if (!raw || typeof raw !== "object") return DEFAULT;
  const r = raw as Partial<EditorialConfig> & Record<string, unknown>;
  const limit = Number(r.recentLimit);
  return {
    eyebrowFeatured: typeof r.eyebrowFeatured === "string" ? r.eyebrowFeatured : DEFAULT.eyebrowFeatured,
    eyebrowRecent: typeof r.eyebrowRecent === "string" ? r.eyebrowRecent : DEFAULT.eyebrowRecent,
    featuredPostId: typeof r.featuredPostId === "number" ? r.featuredPostId : null,
    recentLimit: Number.isFinite(limit) ? Math.min(10, Math.max(2, limit)) : DEFAULT.recentLimit,
    recentPillarIds: Array.isArray(r.recentPillarIds)
      ? r.recentPillarIds.filter((n): n is number => typeof n === "number")
      : [],
    recentTopicIds: Array.isArray(r.recentTopicIds)
      ? r.recentTopicIds.filter((n): n is number => typeof n === "number")
      : [],
    recentStyle: r.recentStyle === "cards" ? "cards" : "list",
    cardAspect:
      r.cardAspect === "square" ? "square" : r.cardAspect === "wide" ? "wide" : "rectangle",
    showThumbnails: typeof r.showThumbnails === "boolean" ? r.showThumbnails : DEFAULT.showThumbnails,
    showDates: typeof r.showDates === "boolean" ? r.showDates : DEFAULT.showDates,
    // Legacy `showExcerpts` (single toggle) is the fallback for both new
    // fields — saved panels keep their previous on/off intent across
    // featured + recent until the user explicitly toggles either one.
    showFeaturedExcerpt:
      typeof r.showFeaturedExcerpt === "boolean"
        ? r.showFeaturedExcerpt
        : typeof (r as { showExcerpts?: unknown }).showExcerpts === "boolean"
          ? Boolean((r as { showExcerpts?: unknown }).showExcerpts)
          : DEFAULT.showFeaturedExcerpt,
    showRecentExcerpts:
      typeof r.showRecentExcerpts === "boolean"
        ? r.showRecentExcerpts
        : typeof (r as { showExcerpts?: unknown }).showExcerpts === "boolean"
          ? Boolean((r as { showExcerpts?: unknown }).showExcerpts)
          : DEFAULT.showRecentExcerpts,
    showSeparators: typeof r.showSeparators === "boolean" ? r.showSeparators : DEFAULT.showSeparators,
    cta:
      r.cta && typeof r.cta === "object" && "label" in r.cta && "href" in r.cta
        ? {
            label: String((r.cta as { label: unknown }).label),
            href: String((r.cta as { href: unknown }).href),
            target:
              (r.cta as { target?: unknown }).target === "_blank" ? "_blank" : "_self",
          }
        : null,
  };
}

interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  /** Resolved public URL — built from postKind + parent slug at row-map
   *  time so callers don't have to re-derive the spike pattern. */
  href: string;
}

/** Build the correct public URL for a post. Pillars + standalones live
 *  at `/<slug>`; spikes live at `/<pillarSlug>/<slug>`. Mirrors the
 *  resolver in `menus/service.ts`'s resolveItemUrl(). */
function postHref(slug: string, kind: string, parentSlug: string | null): string {
  if (kind === "spike" && parentSlug) return `/${parentSlug}/${slug}`;
  return `/${slug}`;
}

function thumbUrl(src: string): string {
  if (!src.startsWith("/media/")) return src;
  return getMediaPublicUrl({
    id: src.slice("/media/".length),
    hasThumb: true,
    variant: "thumb",
    contentVersion: "x",
  });
}

function mediumUrl(src: string): string {
  if (!src.startsWith("/media/")) return src;
  return getMediaPublicUrl({
    id: src.slice("/media/".length),
    hasThumb: false,
    variant: "medium",
    contentVersion: "x",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

async function Render({ db, config }: { db: DbClient; config: EditorialConfig }) {
  const usePillar = config.recentPillarIds.length > 0;
  const useTopic = config.recentTopicIds.length > 0;

  // Featured post: explicit pick wins (the user's deliberate override
  // shows even when it falls outside the filter — "manual = I really
  // want this one"). Auto-pick respects the same filters as the recent
  // grid, so when pillar filtering is on the featured comes from the
  // filtered pool too.
  let featured: PostRow | null = null;
  // SELECT projection includes post_kind + parent_slug so the URL
  // resolver can build `/<pillar>/<spike>` for spikes; `rowToPost`
  // computes the final href once at row-map time.
  const projection = `p.id, p.slug, p.title, p.excerpt, p.featured_image, p.published_at,
                      p.post_kind AS post_kind, parent.slug AS parent_slug`;
  const fromJoin = `FROM posts p LEFT JOIN posts parent ON parent.id = p.parent_id`;

  if (config.featuredPostId != null) {
    const r = await db.execute({
      sql: `SELECT ${projection}
              ${fromJoin}
             WHERE p.id = ? AND p.status = 'published' AND p.trashed_at IS NULL
             LIMIT 1`,
      args: [config.featuredPostId],
    });
    if (r.rows[0]) featured = rowToPost(r.rows[0]);
  }
  if (!featured) {
    const where: string[] = [
      "p.status = 'published'",
      "p.trashed_at IS NULL",
      "p.featured_image IS NOT NULL",
    ];
    const args: (string | number)[] = [];
    if (usePillar) {
      const ph = config.recentPillarIds.map(() => "?").join(",");
      where.push(`p.parent_id IN (${ph})`);
      args.push(...config.recentPillarIds);
    }
    if (useTopic) {
      const ph = config.recentTopicIds.map(() => "?").join(",");
      where.push(
        `EXISTS (SELECT 1 FROM posts_topics pt WHERE pt.post_id = p.id AND pt.topic_id IN (${ph}))`,
      );
      args.push(...config.recentTopicIds);
    }
    const r = await db.execute({
      sql: `SELECT ${projection}
              ${fromJoin}
             WHERE ${where.join(" AND ")}
          ORDER BY p.published_at DESC, p.id DESC
             LIMIT 1`,
      args,
    });
    if (r.rows[0]) featured = rowToPost(r.rows[0]);
  }

  // Right-side grid: most-recent posts, same filter as the auto-pick
  // above when set. Excluding the featured id offsets the grid by 1 so
  // the featured post never appears twice in the panel.
  const excludeId = featured?.id ?? 0;
  const limit = config.recentLimit;

  const where: string[] = [
    "p.status = 'published'",
    "p.trashed_at IS NULL",
    "p.id != ?",
  ];
  const args: (string | number)[] = [excludeId];

  if (usePillar) {
    const pillarPlaceholders = config.recentPillarIds.map(() => "?").join(",");
    where.push(`p.parent_id IN (${pillarPlaceholders})`);
    args.push(...config.recentPillarIds);
  }
  if (useTopic) {
    const topicPlaceholders = config.recentTopicIds.map(() => "?").join(",");
    where.push(
      `EXISTS (SELECT 1 FROM posts_topics pt WHERE pt.post_id = p.id AND pt.topic_id IN (${topicPlaceholders}))`,
    );
    args.push(...config.recentTopicIds);
  }
  args.push(limit);

  const r = await db.execute({
    sql: `SELECT ${projection}
            ${fromJoin}
           WHERE ${where.join(" AND ")}
        ORDER BY p.published_at DESC, p.id DESC
           LIMIT ?`,
    args,
  });
  const recent: PostRow[] = r.rows.map(rowToPost);

  return (
    <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {config.eyebrowFeatured}
        </div>
        {featured ? (
          <Link href={featured.href} className="group block">
            {/* Featured hero is always rendered — it's the layout's
                visual anchor. The `showThumbnails` toggle only governs
                the small thumbs in the recent grid. */}
            <div className="aspect-[16/10] rounded-lg overflow-hidden bg-slate-100 mb-3">
              {featured.featured_image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediumUrl(featured.featured_image)}
                  alt={featured.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-emerald-50" />
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-600 leading-tight">
              {featured.title}
            </h3>
            {config.showDates && featured.published_at && (
              <div className="mt-1 text-xs text-slate-400 tabular-nums">{formatDate(featured.published_at)}</div>
            )}
            {config.showFeaturedExcerpt && featured.excerpt && (
              <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{featured.excerpt}</p>
            )}
          </Link>
        ) : (
          <EmptyState>No featured post yet.</EmptyState>
        )}
      </div>
      <div className="flex flex-col">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {config.eyebrowRecent}
        </div>
        {recent.length === 0 ? (
          <EmptyState>No matching posts.</EmptyState>
        ) : config.recentStyle === "cards" ? (
          /* Cards: thumbnail-on-top tile, title (and optional date)
             below. Uses the medium variant so the larger image isn't
             pixelated. Tiles always have a thumbnail — the toggle that
             governs list-thumbs is irrelevant here. */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recent.map((p) => (
              <Link key={p.id} href={p.href} className="group block">
                <div
                  className={`${
                    config.cardAspect === "square"
                      ? "aspect-square"
                      : config.cardAspect === "wide"
                      ? "aspect-video"
                      : "aspect-[4/3]"
                  } rounded-md overflow-hidden bg-slate-100 mb-2`}
                >
                  {p.featured_image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mediumUrl(p.featured_image)}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-emerald-50" />
                  )}
                </div>
                <div className="text-sm font-medium text-slate-800 group-hover:text-emerald-600 line-clamp-2 leading-snug">
                  {p.title}
                </div>
                {config.showRecentExcerpts && p.excerpt && (
                  <div className="mt-1 text-xs text-slate-500 line-clamp-2 leading-snug">{p.excerpt}</div>
                )}
                {config.showDates && p.published_at && (
                  <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{formatDate(p.published_at)}</div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          /* When separators are off, gap-y handles row spacing.
             When on, gap-y collapses and each row past the first gets a
             top border + symmetric padding so the line sits centered in
             the visual gap. */
          <div className={`grid grid-cols-1 gap-x-4 sm:grid-cols-2 ${config.showSeparators ? "gap-y-0" : "gap-y-4"}`}>
            {recent.map((p, i) => {
              // Two-col grid (sm+): separator above every row past the first
              // (i >= 2). Single-col mobile: separator above every item past
              // the first (i >= 1). i === 1 gets a mobile-only border that
              // resets at `sm` so the row 0 cell on the right stays clean.
              const desktopNewRow = config.showSeparators && i >= 2;
              const mobileOnlyBorder = config.showSeparators && i === 1;
              const sepClass = config.showSeparators
                ? desktopNewRow
                  ? "border-t border-slate-200 pt-4 mt-4"
                  : mobileOnlyBorder
                    ? "border-t border-slate-200 pt-4 mt-4 sm:border-t-0 sm:pt-0 sm:mt-0"
                    : ""
                : "";
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  className={`group flex gap-3 ${sepClass}`.trim()}
                >
                  {config.showThumbnails && (
                    <div className="size-14 shrink-0 rounded-md overflow-hidden bg-slate-100">
                      {p.featured_image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumbUrl(p.featured_image)}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 group-hover:text-emerald-600 line-clamp-2 leading-snug">
                      {p.title}
                    </div>
                    {config.showRecentExcerpts && p.excerpt && (
                      <div className="mt-1 text-xs text-slate-500 line-clamp-2 leading-snug">{p.excerpt}</div>
                    )}
                    {config.showDates && p.published_at && (
                      <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{formatDate(p.published_at)}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {config.cta && config.cta.label && config.cta.href && (
          <Link
            href={config.cta.href}
            target={config.cta.target === "_blank" ? "_blank" : undefined}
            rel={config.cta.target === "_blank" ? "noopener noreferrer" : undefined}
            className="mt-3 self-start relative z-10 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            {config.cta.label} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function rowToPost(r: Record<string, unknown>): PostRow {
  const slug = String(r.slug);
  const kind = String(r.post_kind ?? "standalone");
  const parentSlug = r.parent_slug ? String(r.parent_slug) : null;
  return {
    id: Number(r.id),
    slug,
    title: String(r.title),
    excerpt: r.excerpt ? String(r.excerpt) : null,
    featured_image: r.featured_image ? String(r.featured_image) : null,
    published_at: r.published_at ? String(r.published_at) : null,
    href: postHref(slug, kind, parentSlug),
  };
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

export const editorial: LayoutDef<EditorialConfig> = {
  id: "editorial",
  name: "Editorial",
  description: "Featured post on the left, 2-column grid of recent posts on the right. Filter by pillar or topic.",
  thumbnailSvg: `
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="110" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <rect x="10" y="10" width="85" height="55" rx="3" fill="#d1fae5"/>
      <rect x="10" y="72" width="60" height="6" rx="1" fill="#94a3b8"/>
      <rect x="10" y="84" width="80" height="4" rx="1" fill="#cbd5e1"/>
      <rect x="10" y="92" width="70" height="4" rx="1" fill="#cbd5e1"/>
      <rect x="105" y="10" width="40" height="40" rx="3" fill="#f1f5f9"/>
      <rect x="150" y="10" width="40" height="40" rx="3" fill="#f1f5f9"/>
      <rect x="105" y="55" width="40" height="40" rx="3" fill="#f1f5f9"/>
      <rect x="150" y="55" width="40" height="40" rx="3" fill="#f1f5f9"/>
    </svg>
  `,
  parseConfig,
  Render,
};
