import Link from "next/link";
import type { DbClient } from "@core/db/client";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import type { LayoutDef } from "./types";

interface SectionLink {
  label: string;
  href: string;
  /** When the link came from "Fill from pillar" or auto mode, this is
   *  the source post's id. Sticky across label/href edits in manual
   *  mode — only cleared when the row is removed. The renderer uses it
   *  to look up the post's thumbnail + published_at when the column has
   *  those toggles on. */
  postId?: number | null;
  /** Anchor target. Defaults to "_self". When "_blank", `rel` gets the
   *  noopener/noreferrer pair as the OWASP guidance recommends. */
  target?: "_self" | "_blank";
}

type SectionMode = "manual" | "auto";
type AutoSourceMode = "pillar" | "topic";

interface Section {
  heading: string;
  /** "manual" — curated link list (current behavior).
   *  "auto"   — N most recent published posts from a pillar or topics. */
  mode: SectionMode;
  /** Manual mode only: the curated link list. Untouched in auto mode
   *  so flipping back keeps prior fills. */
  links: SectionLink[];
  /** Auto mode only: feed source. "pillar" = latest spikes under one
   *  pillar; "topic" = latest posts tagged with any of `autoTopicIds`.
   *  Defaults to "pillar" for back-compat with pre-topic configs. */
  autoSourceMode: AutoSourceMode;
  /** Auto+pillar mode only: pillar to source spikes from. */
  autoPillarId: number | null;
  /** Auto+topic mode only: topic ids whose latest posts feed the column.
   *  OR-combined — a post matches if it carries any of these topics. */
  autoTopicIds: number[];
  /** Auto mode only: how many posts to show (1–20). */
  autoLimit: number;
  /** Per-column display toggles. Default off (matches the original
   *  text-only column behavior). Apply to both manual (rows with
   *  postId) and auto rows. */
  showDate: boolean;
  showThumbnail: boolean;
  /** Show a 2-line post excerpt under each row's title. */
  showExcerpt: boolean;
  /** Draw a 1px line between rows in this column. */
  showSeparator: boolean;
  /** Optional per-column CTA — rendered as a plain link below the rows.
   *  Carries its own target. */
  cta: { label: string; href: string; target: "_self" | "_blank" } | null;
}

export interface MultiSectionConfig {
  sections: Section[];                       // exactly 3 columns
  featuredEyebrow: string;
  featuredPostId: number | null;
  /** Show the featured post's published date below its title. */
  featuredShowDate: boolean;
  /** Show the featured post's excerpt (2-line clamp) below its title. */
  featuredShowExcerpt: boolean;
}

const DEFAULT_DISPLAY: Pick<Section, "showDate" | "showThumbnail" | "showExcerpt" | "showSeparator"> = {
  showDate: false,
  showThumbnail: false,
  showExcerpt: false,
  showSeparator: false,
};

const DEFAULT_AUTO = {
  autoSourceMode: "pillar" as AutoSourceMode,
  autoPillarId: null,
  autoTopicIds: [] as number[],
  autoLimit: 5,
};

const DEFAULT: MultiSectionConfig = {
  sections: [
    { heading: "Guides", mode: "manual", links: [], ...DEFAULT_AUTO, ...DEFAULT_DISPLAY, cta: null },
    { heading: "Reference", mode: "manual", links: [], ...DEFAULT_AUTO, ...DEFAULT_DISPLAY, cta: null },
    { heading: "Recipes", mode: "manual", links: [], ...DEFAULT_AUTO, ...DEFAULT_DISPLAY, cta: null },
  ],
  featuredEyebrow: "Featured",
  featuredPostId: null,
  featuredShowDate: false,
  featuredShowExcerpt: false,
};

function isSectionLink(x: unknown): x is SectionLink {
  return !!x && typeof x === "object" && "label" in x && "href" in x;
}

function parseSection(x: unknown, fallback: Section): Section {
  if (!x || typeof x !== "object") return fallback;
  const r = x as Partial<Section>;
  const limit = Number(r.autoLimit);
  return {
    heading: typeof r.heading === "string" ? r.heading : fallback.heading,
    mode: r.mode === "auto" ? "auto" : "manual",
    links: Array.isArray(r.links)
      ? r.links.filter(isSectionLink).map((l) => {
          const link = l as SectionLink;
          return {
            label: String(link.label),
            href: String(link.href),
            postId: typeof link.postId === "number" ? link.postId : null,
            target: link.target === "_blank" ? "_blank" : "_self",
          };
        })
      : [],
    autoSourceMode: r.autoSourceMode === "topic" ? "topic" : "pillar",
    autoPillarId: typeof r.autoPillarId === "number" ? r.autoPillarId : null,
    autoTopicIds: Array.isArray(r.autoTopicIds)
      ? r.autoTopicIds
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [],
    autoLimit: Number.isFinite(limit) ? Math.min(20, Math.max(1, limit)) : fallback.autoLimit,
    showDate: typeof r.showDate === "boolean" ? r.showDate : fallback.showDate,
    showThumbnail: typeof r.showThumbnail === "boolean" ? r.showThumbnail : fallback.showThumbnail,
    showExcerpt: typeof r.showExcerpt === "boolean" ? r.showExcerpt : fallback.showExcerpt,
    showSeparator: typeof r.showSeparator === "boolean" ? r.showSeparator : fallback.showSeparator,
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

function parseConfig(raw: unknown): MultiSectionConfig {
  if (!raw || typeof raw !== "object") return DEFAULT;
  const r = raw as Partial<MultiSectionConfig>;
  const sections: Section[] = Array.isArray(r.sections)
    ? [
        parseSection(r.sections[0], DEFAULT.sections[0]),
        parseSection(r.sections[1], DEFAULT.sections[1]),
        parseSection(r.sections[2], DEFAULT.sections[2]),
      ]
    : DEFAULT.sections;
  return {
    sections,
    featuredEyebrow: typeof r.featuredEyebrow === "string" ? r.featuredEyebrow : DEFAULT.featuredEyebrow,
    featuredPostId: typeof r.featuredPostId === "number" ? r.featuredPostId : null,
    featuredShowDate:
      typeof r.featuredShowDate === "boolean" ? r.featuredShowDate : DEFAULT.featuredShowDate,
    featuredShowExcerpt:
      typeof r.featuredShowExcerpt === "boolean"
        ? r.featuredShowExcerpt
        : DEFAULT.featuredShowExcerpt,
  };
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

// Build the correct public URL for a post — same rule as
// menus/service.ts resolveItemUrl(): pillars + standalones at /<slug>;
// spikes at /<pillarSlug>/<slug>.
function postHref(slug: string, kind: string, parentSlug: string | null): string {
  if (kind === "spike" && parentSlug) return `/${parentSlug}/${slug}`;
  return `/${slug}`;
}

interface PostMeta {
  featured_image: string | null;
  published_at: string | null;
  excerpt: string | null;
}

/** A column row resolved to its render-time shape. The same shape is
 *  used by both manual and auto modes so the row renderer is one
 *  function. `meta` is filled in only when the column needs it
 *  (showDate or showThumbnail is on AND the row has a postId). */
interface ResolvedRow {
  label: string;
  href: string;
  target: "_self" | "_blank";
  meta: PostMeta | null;
}

async function Render({ db, config }: { db: DbClient; config: MultiSectionConfig }) {
  // ── Featured (right-rail) post ───────────────────────────────────────
  let featured:
    | { id: number; href: string; title: string; image: string | null; publishedAt: string | null; excerpt: string | null }
    | null = null;
  if (config.featuredPostId != null) {
    const r = await db.execute({
      sql: `SELECT p.id, p.slug, p.title, p.featured_image, p.published_at, p.excerpt,
                   p.post_kind AS post_kind, parent.slug AS parent_slug
              FROM posts p
              LEFT JOIN posts parent ON parent.id = p.parent_id
             WHERE p.id = ? AND p.status = 'published' AND p.trashed_at IS NULL
             LIMIT 1`,
      args: [config.featuredPostId],
    });
    if (r.rows[0]) {
      const slug = String(r.rows[0].slug);
      const kind = String(r.rows[0].post_kind ?? "standalone");
      const parentSlug = r.rows[0].parent_slug ? String(r.rows[0].parent_slug) : null;
      featured = {
        id: Number(r.rows[0].id),
        href: postHref(slug, kind, parentSlug),
        title: String(r.rows[0].title),
        image: r.rows[0].featured_image ? String(r.rows[0].featured_image) : null,
        publishedAt: r.rows[0].published_at ? String(r.rows[0].published_at) : null,
        excerpt: r.rows[0].excerpt ? String(r.rows[0].excerpt) : null,
      };
    }
  }

  // ── Resolve per-section rows ─────────────────────────────────────────
  // Auto sections each run their own pillar query in parallel. Manual
  // sections that need post-meta share a single batch query for every
  // referenced postId across all manual columns.
  const wantsMeta = (s: Section) => s.showThumbnail || s.showDate || s.showExcerpt;

  // Collect manual postIds that need meta lookup.
  const manualMetaIds = new Set<number>();
  for (const s of config.sections) {
    if (s.mode !== "manual" || !wantsMeta(s)) continue;
    for (const l of s.links) if (typeof l.postId === "number") manualMetaIds.add(l.postId);
  }

  // Run manual-meta + per-column auto queries in parallel.
  const [manualMeta, ...autoResults] = await Promise.all<
    Map<number, PostMeta> | ResolvedRow[]
  >([
    fetchPostMeta(db, Array.from(manualMetaIds)),
    ...config.sections.map((s) =>
      s.mode === "auto" && isAutoConfigured(s)
        ? fetchAutoRows(db, s)
        : Promise.resolve([] as ResolvedRow[]),
    ),
  ]);
  const manualMetaMap = manualMeta as Map<number, PostMeta>;
  const autoRowsBySection = autoResults as ResolvedRow[][];

  function resolveRows(s: Section, idx: number): ResolvedRow[] {
    if (s.mode === "auto") return autoRowsBySection[idx];
    return s.links.map((l) => ({
      label: l.label,
      href: l.href,
      target: l.target ?? "_self",
      meta:
        wantsMeta(s) && typeof l.postId === "number"
          ? manualMetaMap.get(l.postId) ?? null
          : null,
    }));
  }

  return (
    <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
      {config.sections.map((s, idx) => {
        const rows = resolveRows(s, idx);
        const emptyMsg =
          s.mode === "auto"
            ? !isAutoConfigured(s)
              ? s.autoSourceMode === "topic"
                ? "Pick at least one topic in the editor."
                : "Pick a pillar in the editor."
              : s.autoSourceMode === "topic"
                ? "No published posts yet for these topics."
                : "No spikes yet for this pillar."
            : "No links yet.";
        return (
          <div key={idx} className="flex flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
              {s.heading}
            </div>
            {rows.length === 0 ? (
              <div className="text-xs text-slate-400 italic">{emptyMsg}</div>
            ) : (
              <ul className={s.showSeparator ? "divide-y divide-slate-200" : "space-y-2.5"}>
                {rows.map((row, i) => {
                  const showThumb = s.showThumbnail && row.meta?.featured_image;
                  const showDate = s.showDate && row.meta?.published_at;
                  const showExcerpt = s.showExcerpt && row.meta?.excerpt;
                  // With separators on, each row gets symmetric vertical
                  // padding so the divider sits cleanly between rows; the
                  // first row's `pt-0` keeps it tight to the eyebrow.
                  const rowPad = s.showSeparator ? `py-2.5 ${i === 0 ? "pt-0" : ""}` : "";
                  return (
                    <li key={i} className={rowPad}>
                      <Link
                        href={row.href}
                        target={row.target === "_blank" ? "_blank" : undefined}
                        rel={row.target === "_blank" ? "noopener noreferrer" : undefined}
                        className="group flex gap-3"
                      >
                        {showThumb && (
                          <div className="size-12 shrink-0 rounded overflow-hidden bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl(row.meta!.featured_image!)}
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
                              {row.meta!.excerpt}
                            </div>
                          )}
                          {showDate && (
                            <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                              {formatDate(row.meta!.published_at)}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {s.cta && s.cta.label && s.cta.href && (
              <Link
                href={s.cta.href}
                target={s.cta.target === "_blank" ? "_blank" : undefined}
                rel={s.cta.target === "_blank" ? "noopener noreferrer" : undefined}
                className="mt-3 self-start relative z-10 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                {s.cta.label} <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        );
      })}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {config.featuredEyebrow}
        </div>
        {featured ? (
          <Link href={featured.href} className="group block">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-slate-100 mb-2">
              {featured.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediumUrl(featured.image)}
                  alt={featured.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-emerald-50" />
              )}
            </div>
            <div className="text-base font-semibold text-slate-800 group-hover:text-emerald-600 leading-tight line-clamp-2">
              {featured.title}
            </div>
            {config.featuredShowExcerpt && featured.excerpt && (
              <div className="mt-1 text-xs text-slate-500 line-clamp-2 leading-snug">
                {featured.excerpt}
              </div>
            )}
            {config.featuredShowDate && featured.publishedAt && (
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {formatDate(featured.publishedAt)}
              </div>
            )}
          </Link>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            Pick a featured post in the editor.
          </div>
        )}
      </div>
    </div>
  );
}

async function fetchPostMeta(db: DbClient, ids: number[]): Promise<Map<number, PostMeta>> {
  const out = new Map<number, PostMeta>();
  if (ids.length === 0) return out;
  const ph = ids.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT id, featured_image, published_at, excerpt
            FROM posts
           WHERE id IN (${ph}) AND status = 'published' AND trashed_at IS NULL`,
    args: ids,
  });
  for (const row of r.rows) {
    out.set(Number(row.id), {
      featured_image: row.featured_image ? String(row.featured_image) : null,
      published_at: row.published_at ? String(row.published_at) : null,
      excerpt: row.excerpt ? String(row.excerpt) : null,
    });
  }
  return out;
}

function isAutoConfigured(s: Section): boolean {
  if (s.autoSourceMode === "topic") return s.autoTopicIds.length > 0;
  return s.autoPillarId != null;
}

async function fetchAutoRows(db: DbClient, s: Section): Promise<ResolvedRow[]> {
  // Pillar mode: latest spikes under one pillar. Pillar-mode rows are
  // always spikes, so post_kind doesn't need to be selected.
  if (s.autoSourceMode !== "topic") {
    if (s.autoPillarId == null) return [];
    const r = await db.execute({
      sql: `SELECT p.id, p.slug, p.title, p.featured_image, p.published_at, p.excerpt,
                   parent.slug AS parent_slug
              FROM posts p
              LEFT JOIN posts parent ON parent.id = p.parent_id
             WHERE p.parent_id = ?
               AND p.status = 'published'
               AND p.trashed_at IS NULL
          ORDER BY p.published_at DESC, p.id DESC
             LIMIT ?`,
      args: [s.autoPillarId, s.autoLimit],
    });
    return r.rows.map((row) => {
      const slug = String(row.slug);
      const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
      return {
        label: String(row.title),
        href: postHref(slug, "spike", parentSlug),
        target: "_self" as const,
        meta: {
          featured_image: row.featured_image ? String(row.featured_image) : null,
          published_at: row.published_at ? String(row.published_at) : null,
          excerpt: row.excerpt ? String(row.excerpt) : null,
        },
      };
    });
  }

  // Topic mode: latest published posts tagged with any of the selected
  // topics (OR-combined). Posts can be any kind — pull post_kind +
  // parent_slug so the href uses the correct shape for spikes.
  if (s.autoTopicIds.length === 0) return [];
  const ph = s.autoTopicIds.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT p.id, p.slug, p.title, p.featured_image, p.published_at, p.excerpt,
                 p.post_kind, parent.slug AS parent_slug
            FROM posts p
            LEFT JOIN posts parent ON parent.id = p.parent_id
           WHERE EXISTS (
                   SELECT 1 FROM posts_topics pt
                    WHERE pt.post_id = p.id
                      AND pt.topic_id IN (${ph})
                 )
             AND p.status = 'published'
             AND p.trashed_at IS NULL
        ORDER BY p.published_at DESC, p.id DESC
           LIMIT ?`,
    args: [...s.autoTopicIds, s.autoLimit],
  });
  return r.rows.map((row) => {
    const slug = String(row.slug);
    const kind = String(row.post_kind ?? "standalone");
    const parentSlug = row.parent_slug ? String(row.parent_slug) : null;
    return {
      label: String(row.title),
      href: postHref(slug, kind, parentSlug),
      target: "_self" as const,
      meta: {
        featured_image: row.featured_image ? String(row.featured_image) : null,
        published_at: row.published_at ? String(row.published_at) : null,
        excerpt: row.excerpt ? String(row.excerpt) : null,
      },
    };
  });
}

export const multiSection: LayoutDef<MultiSectionConfig> = {
  id: "multi-section",
  name: "Multi-section",
  description: "3 columns + 1 featured-post column. Each column can be a curated link list, auto-pulled latest spikes from a pillar, or auto-pulled latest posts from one or more topics.",
  thumbnailSvg: `
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="110" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <g>
        <rect x="10" y="10" width="35" height="6" rx="1" fill="#94a3b8"/>
        <rect x="10" y="22" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="30" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="38" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="46" width="35" height="3" rx="1" fill="#cbd5e1"/>
      </g>
      <g transform="translate(50,0)">
        <rect x="10" y="10" width="35" height="6" rx="1" fill="#94a3b8"/>
        <rect x="10" y="22" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="30" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="38" width="40" height="3" rx="1" fill="#cbd5e1"/>
      </g>
      <g transform="translate(100,0)">
        <rect x="10" y="10" width="35" height="6" rx="1" fill="#94a3b8"/>
        <rect x="10" y="22" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="30" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="38" width="40" height="3" rx="1" fill="#cbd5e1"/>
        <rect x="10" y="46" width="40" height="3" rx="1" fill="#cbd5e1"/>
      </g>
      <rect x="160" y="10" width="30" height="35" rx="3" fill="#d1fae5"/>
      <rect x="160" y="50" width="30" height="3" rx="1" fill="#94a3b8"/>
      <rect x="160" y="56" width="22" height="3" rx="1" fill="#cbd5e1"/>
    </svg>
  `,
  parseConfig,
  Render,
};
