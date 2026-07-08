import Link from "next/link";
import type { DbClient } from "@core/db/client";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import type { LayoutDef } from "./types";

interface SidebarLink {
  label: string;
  href: string;
  /** Anchor target — defaults to "_self". */
  target?: "_self" | "_blank";
  /** When the link came from "Fill from pillar", this is the source
   *  spike's id. Drives the optional date display. */
  postId?: number | null;
}

export interface ShowcaseConfig {
  /** Eyebrow above the 3-column tile grid (left, 3/4 width). */
  tilesEyebrow: string;
  /** How many post tiles to show. Range 3–9. */
  tilesLimit: number;
  /** Restrict the tiles to spikes hanging off these pillar ids.
   *  Empty = no pillar filter. AND-combines with `tilesTopicIds` when
   *  both are set — same precedence rule as Editorial. */
  tilesPillarIds: number[];
  /** Optional topic-id filter for the tiles. */
  tilesTopicIds: number[];
  /** Tile thumbnail aspect ratio:
   *    - "rectangle": 4/3 (default — matches the Editorial card default).
   *    - "wide":      16/9 (cinematic).
   *    - "square":    1/1. */
  cardAspect: "rectangle" | "wide" | "square";
  /** Show the published date under each tile's title. */
  showTilesDate: boolean;
  /** Show a 2-line post excerpt under each tile's title. */
  showTilesExcerpt: boolean;
  /** Optional CTA below the tile grid. Renders as a plain link, same
   *  style as the per-column CTA in Multi-section. */
  tilesCta: { label: string; href: string; target: "_self" | "_blank" } | null;
  /** Right-rail (1/4 width) heading + curated links + CTA. */
  sidebarHeading: string;
  /** Sidebar source mode:
   *    - "manual": curated `sidebarLinks` list (current default).
   *    - "auto":   N latest spikes from `sidebarAutoPillarId`. */
  sidebarMode: "manual" | "auto";
  sidebarLinks: SidebarLink[];
  /** Auto mode only — pillar to source spikes from. */
  sidebarAutoPillarId: number | null;
  /** Auto mode only — how many spikes to show (1–20). */
  sidebarAutoLimit: number;
  /** Show the published date under each sidebar link. Applies to
   *  auto rows always, and to manual links that carry a postId. */
  showSidebarDate: boolean;
  /** Show small thumbnail next to each sidebar link. Same applicability
   *  rules as `showSidebarDate`. */
  showSidebarThumbnail: boolean;
  /** Show 1px separator lines between sidebar rows. */
  showSidebarSeparator: boolean;
  /** Show a 2-line post excerpt under each sidebar row's title. Same
   *  applicability rules as `showSidebarDate`. */
  showSidebarExcerpt: boolean;
  /** Optional rich-text HTML rendered in the sidebar. Always rendered
   *  when set; appears below the link list (with a divider between
   *  them) when both are present. Sanitised to safe-ish HTML at parse
   *  time (Tiptap output is well-formed). */
  sidebarRichText: string;
  cta: { label: string; href: string; target: "_self" | "_blank" } | null;
}

const DEFAULT: ShowcaseConfig = {
  tilesEyebrow: "From the blog",
  tilesLimit: 6,
  tilesPillarIds: [],
  tilesTopicIds: [],
  cardAspect: "rectangle",
  showTilesDate: false,
  showTilesExcerpt: false,
  tilesCta: null,
  sidebarHeading: "Highlights",
  sidebarMode: "manual",
  sidebarLinks: [],
  sidebarAutoPillarId: null,
  sidebarAutoLimit: 5,
  showSidebarDate: false,
  showSidebarThumbnail: false,
  showSidebarSeparator: false,
  showSidebarExcerpt: false,
  sidebarRichText: "",
  cta: null,
};

function isLink(x: unknown): x is SidebarLink {
  return !!x && typeof x === "object" && "label" in x && "href" in x;
}

function parseConfig(raw: unknown): ShowcaseConfig {
  if (!raw || typeof raw !== "object") return DEFAULT;
  const r = raw as Partial<ShowcaseConfig>;
  const limit = Number(r.tilesLimit);
  return {
    tilesEyebrow: typeof r.tilesEyebrow === "string" ? r.tilesEyebrow : DEFAULT.tilesEyebrow,
    tilesLimit: Number.isFinite(limit) ? Math.min(9, Math.max(3, limit)) : DEFAULT.tilesLimit,
    tilesPillarIds: Array.isArray(r.tilesPillarIds)
      ? r.tilesPillarIds.filter((n): n is number => typeof n === "number")
      : [],
    tilesTopicIds: Array.isArray(r.tilesTopicIds)
      ? r.tilesTopicIds.filter((n): n is number => typeof n === "number")
      : [],
    cardAspect:
      r.cardAspect === "square" ? "square" : r.cardAspect === "wide" ? "wide" : "rectangle",
    showTilesDate:
      typeof r.showTilesDate === "boolean" ? r.showTilesDate : DEFAULT.showTilesDate,
    showTilesExcerpt:
      typeof r.showTilesExcerpt === "boolean" ? r.showTilesExcerpt : DEFAULT.showTilesExcerpt,
    tilesCta:
      r.tilesCta && typeof r.tilesCta === "object" && "label" in r.tilesCta && "href" in r.tilesCta
        ? {
            label: String((r.tilesCta as { label: unknown }).label),
            href: String((r.tilesCta as { href: unknown }).href),
            target:
              (r.tilesCta as { target?: unknown }).target === "_blank" ? "_blank" : "_self",
          }
        : null,
    sidebarHeading: typeof r.sidebarHeading === "string" ? r.sidebarHeading : DEFAULT.sidebarHeading,
    sidebarMode: r.sidebarMode === "auto" ? "auto" : "manual",
    sidebarAutoPillarId:
      typeof r.sidebarAutoPillarId === "number" ? r.sidebarAutoPillarId : null,
    sidebarAutoLimit: (() => {
      const n = Number(r.sidebarAutoLimit);
      return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : DEFAULT.sidebarAutoLimit;
    })(),
    sidebarLinks: Array.isArray(r.sidebarLinks)
      ? r.sidebarLinks.filter(isLink).map((l) => {
          const link = l as SidebarLink;
          return {
            label: String(link.label),
            href: String(link.href),
            target: link.target === "_blank" ? "_blank" : "_self",
            postId: typeof link.postId === "number" ? link.postId : null,
          };
        })
      : [],
    showSidebarDate:
      typeof r.showSidebarDate === "boolean" ? r.showSidebarDate : DEFAULT.showSidebarDate,
    showSidebarThumbnail:
      typeof r.showSidebarThumbnail === "boolean"
        ? r.showSidebarThumbnail
        : DEFAULT.showSidebarThumbnail,
    showSidebarSeparator:
      typeof r.showSidebarSeparator === "boolean"
        ? r.showSidebarSeparator
        : DEFAULT.showSidebarSeparator,
    showSidebarExcerpt:
      typeof r.showSidebarExcerpt === "boolean"
        ? r.showSidebarExcerpt
        : DEFAULT.showSidebarExcerpt,
    sidebarRichText:
      typeof r.sidebarRichText === "string" ? r.sidebarRichText : DEFAULT.sidebarRichText,
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

function mediumUrl(src: string): string {
  if (!src.startsWith("/media/")) return src;
  return getMediaPublicUrl({
    id: src.slice("/media/".length),
    hasThumb: false,
    variant: "medium",
    contentVersion: "x",
  });
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

// Build the correct public URL for a post — same rule as
// menus/service.ts resolveItemUrl(): pillars + standalones at /<slug>;
// spikes at /<pillarSlug>/<slug>.
function postHref(slug: string, kind: string, parentSlug: string | null): string {
  if (kind === "spike" && parentSlug) return `/${parentSlug}/${slug}`;
  return `/${slug}`;
}

function rowToTile(row: Record<string, unknown>) {
  const slug = String(row.slug);
  const kind = String(row.post_kind ?? "standalone");
  const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
  return {
    id: Number(row.id),
    href: postHref(slug, kind, parentSlug),
    title: String(row.title),
    image: row.featured_image ? String(row.featured_image) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    excerpt: row.excerpt ? String(row.excerpt) : null,
  };
}

async function Render({ db, config }: { db: DbClient; config: ShowcaseConfig }) {
  // SELECT projection includes post_kind + parent_slug so the URL helper
  // can build /<pillar>/<spike> for spike posts.
  const projection = `p.id, p.slug, p.title, p.featured_image, p.excerpt,
                      p.post_kind AS post_kind, parent.slug AS parent_slug, p.published_at`;
  const fromJoin = `FROM posts p LEFT JOIN posts parent ON parent.id = p.parent_id`;

  // Build the WHERE clause incrementally so pillar + topic filters can
  // AND together cleanly. Topic filter uses an EXISTS subquery (instead
  // of JOIN+DISTINCT) so we don't have to multiply rows when both
  // filters are on.
  const where: string[] = ["p.status = 'published'", "p.trashed_at IS NULL"];
  const args: (string | number)[] = [];
  if (config.tilesPillarIds.length > 0) {
    const ph = config.tilesPillarIds.map(() => "?").join(",");
    where.push(`p.parent_id IN (${ph})`);
    args.push(...config.tilesPillarIds);
  }
  if (config.tilesTopicIds.length > 0) {
    const ph = config.tilesTopicIds.map(() => "?").join(",");
    where.push(
      `EXISTS (SELECT 1 FROM posts_topics pt WHERE pt.post_id = p.id AND pt.topic_id IN (${ph}))`,
    );
    args.push(...config.tilesTopicIds);
  }
  args.push(config.tilesLimit);

  const r = await db.execute({
    sql: `SELECT ${projection}
            ${fromJoin}
           WHERE ${where.join(" AND ")}
        ORDER BY p.published_at DESC, p.id DESC
           LIMIT ?`,
    args,
  });
  const tiles: ReturnType<typeof rowToTile>[] = r.rows.map(rowToTile);

  // Resolve sidebar rows. Auto mode runs a per-pillar query for the
  // latest spikes; manual mode batches a single query for whatever
  // postIds the curated links carry. Both produce the same row shape.
  interface SidebarRow {
    label: string;
    href: string;
    target: "_self" | "_blank";
    publishedAt: string | null;
    featuredImage: string | null;
    excerpt: string | null;
  }
  let sidebarRows: SidebarRow[] = [];
  const wantsSidebarMeta =
    config.showSidebarDate || config.showSidebarThumbnail || config.showSidebarExcerpt;
  if (config.sidebarMode === "auto" && config.sidebarAutoPillarId != null) {
    const sr = await db.execute({
      sql: `SELECT p.id, p.slug, p.title, p.featured_image, p.published_at, p.excerpt,
                   parent.slug AS parent_slug
              FROM posts p
              LEFT JOIN posts parent ON parent.id = p.parent_id
             WHERE p.parent_id = ?
               AND p.status = 'published'
               AND p.trashed_at IS NULL
          ORDER BY p.published_at DESC, p.id DESC
             LIMIT ?`,
      args: [config.sidebarAutoPillarId, config.sidebarAutoLimit],
    });
    sidebarRows = sr.rows.map((row) => {
      const slug = String(row.slug);
      const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
      return {
        label: String(row.title),
        href: postHref(slug, "spike", parentSlug),
        target: "_self" as const,
        publishedAt: row.published_at ? String(row.published_at) : null,
        featuredImage: row.featured_image ? String(row.featured_image) : null,
        excerpt: row.excerpt ? String(row.excerpt) : null,
      };
    });
  } else if (config.sidebarMode === "manual") {
    // Batch-fetch meta for the curated links that need it.
    const ids = wantsSidebarMeta
      ? config.sidebarLinks
          .map((l) => l.postId)
          .filter((id): id is number => typeof id === "number")
      : [];
    const meta = new Map<number, { publishedAt: string | null; featuredImage: string | null; excerpt: string | null }>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const dr = await db.execute({
        sql: `SELECT id, featured_image, published_at, excerpt
                FROM posts
               WHERE id IN (${ph}) AND status = 'published' AND trashed_at IS NULL`,
        args: ids,
      });
      for (const row of dr.rows) {
        meta.set(Number(row.id), {
          publishedAt: row.published_at ? String(row.published_at) : null,
          featuredImage: row.featured_image ? String(row.featured_image) : null,
          excerpt: row.excerpt ? String(row.excerpt) : null,
        });
      }
    }
    sidebarRows = config.sidebarLinks.map((l) => {
      const m = typeof l.postId === "number" ? meta.get(l.postId) ?? null : null;
      return {
        label: l.label,
        href: l.href,
        target: l.target ?? "_self",
        publishedAt: m?.publishedAt ?? null,
        featuredImage: m?.featuredImage ?? null,
        excerpt: m?.excerpt ?? null,
      };
    });
  }

  const hasSidebarLinks = sidebarRows.length > 0;
  const hasSidebarText = config.sidebarRichText.trim() !== "";

  const aspectCls =
    config.cardAspect === "square"
      ? "aspect-square"
      : config.cardAspect === "wide"
      ? "aspect-video"
      : "aspect-[4/3]";

  return (
    <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-4 gap-8">
      <div className="md:col-span-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {config.tilesEyebrow}
        </div>
        {tiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            No matching posts.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {tiles.map((p) => (
              <Link key={p.id} href={p.href} className="group block">
                <div className={`${aspectCls} rounded-md overflow-hidden bg-slate-100 mb-2`}>
                  {p.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mediumUrl(p.image)}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-50 to-amber-100" />
                  )}
                </div>
                <div className="text-sm text-slate-800 group-hover:text-emerald-600 line-clamp-2 leading-snug">
                  {p.title}
                </div>
                {config.showTilesExcerpt && p.excerpt && (
                  <div className="mt-1 text-xs text-slate-500 line-clamp-2 leading-snug">
                    {p.excerpt}
                  </div>
                )}
                {config.showTilesDate && p.publishedAt && (
                  <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                    {formatDate(p.publishedAt)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
        {config.tilesCta && config.tilesCta.label && config.tilesCta.href && (
          <Link
            href={config.tilesCta.href}
            target={config.tilesCta.target === "_blank" ? "_blank" : undefined}
            rel={config.tilesCta.target === "_blank" ? "noopener noreferrer" : undefined}
            className="mt-4 relative z-10 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            {config.tilesCta.label} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {config.sidebarHeading}
        </div>
        {hasSidebarLinks && (
          <ul
            className={`mb-6 ${
              config.showSidebarSeparator ? "divide-y divide-slate-200" : "space-y-2.5"
            }`}
          >
            {sidebarRows.map((row, i) => {
              const showThumb = config.showSidebarThumbnail && row.featuredImage;
              const showDate = config.showSidebarDate && row.publishedAt;
              const showExcerpt = config.showSidebarExcerpt && row.excerpt;
              const rowPad = config.showSidebarSeparator
                ? `py-2 ${i === 0 ? "pt-0" : ""}`
                : "";
              return (
                <li key={i} className={rowPad}>
                  <Link
                    href={row.href}
                    target={row.target === "_blank" ? "_blank" : undefined}
                    rel={row.target === "_blank" ? "noopener noreferrer" : undefined}
                    className="group flex gap-2.5"
                  >
                    {showThumb && (
                      <div className="size-10 shrink-0 rounded overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(row.featuredImage!)}
                          alt={row.label}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 group-hover:text-emerald-600 leading-snug">
                        {row.label}
                      </div>
                      {showExcerpt && (
                        <div className="mt-0.5 text-xs text-slate-500 line-clamp-2 leading-snug">
                          {row.excerpt}
                        </div>
                      )}
                      {showDate && (
                        <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                          {formatDate(row.publishedAt!)}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {hasSidebarText && (
          <>
            {/* Divider only when both surfaces are present — text alone
                doesn't need a leading line. */}
            {hasSidebarLinks && <hr className="border-slate-200 mb-4" />}
            <div
              className="prose prose-sm prose-slate max-w-none mb-6"
              dangerouslySetInnerHTML={{ __html: config.sidebarRichText }}
            />
          </>
        )}
        {!hasSidebarLinks && !hasSidebarText && (
          <div className="text-xs text-slate-400 italic mb-4">No links yet.</div>
        )}
        {config.cta && config.cta.label && config.cta.href && (
          <Link
            href={config.cta.href}
            target={config.cta.target === "_blank" ? "_blank" : undefined}
            rel={config.cta.target === "_blank" ? "noopener noreferrer" : undefined}
            className="relative z-10 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            {config.cta.label} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export const showcase: LayoutDef<ShowcaseConfig> = {
  id: "showcase",
  name: "Showcase",
  description: "3-column image grid (3/4 width) with a sidebar of curated links + CTA (1/4 width).",
  thumbnailSvg: `
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="110" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <rect x="10" y="10" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="55" y="10" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="100" y="10" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="10" y="45" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="55" y="45" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="100" y="45" width="40" height="30" rx="3" fill="#fef3c7"/>
      <rect x="150" y="10" width="40" height="6" rx="1" fill="#94a3b8"/>
      <rect x="150" y="22" width="40" height="3" rx="1" fill="#cbd5e1"/>
      <rect x="150" y="30" width="40" height="3" rx="1" fill="#cbd5e1"/>
      <rect x="150" y="38" width="32" height="3" rx="1" fill="#cbd5e1"/>
      <rect x="150" y="60" width="40" height="9" rx="2" fill="#10b981"/>
    </svg>
  `,
  parseConfig,
  Render,
};
