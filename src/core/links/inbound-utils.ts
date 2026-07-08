// Pure helpers for the Backlinks scanner. Kept in a separate module from
// the server action wrapper (`inbound.ts`) so they can be unit-tested
// without pulling the next-auth / next/server import chain.

export type InboundLinkSourceKind = "page" | "post";
export type InboundHitKind = "richtext" | "cta";
export type InboundPostKind = "pillar" | "spike" | "standalone";

export interface InboundLinkSource {
  kind: InboundLinkSourceKind;
  id: number;
  title: string;
  slug: string;
  postKind?: InboundPostKind;
  parentId?: number | null;
  parentSlug?: string | null;
  parentTitle?: string | null;
}

export interface InboundLink {
  source: InboundLinkSource;
  hits: { kind: InboundHitKind; count: number }[];
}

export interface InboundLinkGroup {
  /** Stable group id: `pillar-<id>` or the literal `standalone-pages`. */
  key: string;
  label: string;
  /** Tailwind bg-class for the group header + cards. */
  bgClass: string;
  links: InboundLink[];
}

/**
 * Normalize an arbitrary href to a comparable internal path, or null if the
 * href is not an internal target we can match against (cross-origin, mailto,
 * empty, etc.). The root path "/" is preserved as-is.
 *
 * `originHost` is matched against the URL's hostname only — the port is
 * intentionally ignored so a dev-mode link to `http://localhost:3000/foo`
 * still resolves the same as `/foo`.
 */
export function normalizeUrl(href: string, originHost: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return null;

  let path: string;
  if (trimmed.startsWith("/")) {
    path = trimmed;
  } else if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      // Compare against hostname (no port) so a dev-mode origin like
      // `localhost:3000` matches absolute links written as
      // `http://localhost:3000/foo`.
      if (u.hostname !== originHost) return null;
      path = u.pathname + u.search + u.hash;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  path = path.replace(/[?#].*$/, "");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  return path || null;
}

const ANCHOR_HREF_RE = /<a\b[^>]*?\bhref\s*=\s*"([^"]+)"/gi;

/**
 * Decode the small set of HTML entities ProseMirror emits inside attribute
 * values. The common one is `&amp;` (any ampersand in a query string is
 * serialized this way); the others surface rarely but are cheap to handle.
 */
function decodeAttrEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract every href from `<a>` tags in trusted Tiptap-generated HTML.
 * The Link extension (post-unification) emits double-quoted href and
 * normalized whitespace, so a regex is sufficient — no DOM parser needed.
 * Entity-encoded ampersands (`&amp;`) and friends are decoded so the
 * downstream matcher sees raw URLs.
 */
export function extractRichTextHrefs(html: string): string[] {
  if (!html) return [];
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_HREF_RE.lastIndex = 0;
  while ((m = ANCHOR_HREF_RE.exec(html)) !== null) {
    hits.push(decodeAttrEntities(m[1]));
  }
  return hits;
}

/**
 * Per-block CTA href dispatch. Returns the structured CTA URL for known
 * link-aware blocks, or null otherwise. Field names differ by block:
 *   - Hero stores its CTA href under `props.ctaHref`
 *   - Banner and Button store theirs under `props.href`
 * To support a new link-aware block, add a case here.
 */
export function getCtaHref(block: { type: string; props: unknown }): string | null {
  if (typeof block?.type !== "string" || typeof block?.props !== "object" || !block.props) {
    return null;
  }
  const props = block.props as Record<string, unknown>;
  let raw: unknown;
  switch (block.type) {
    case "Hero":
      raw = props.ctaHref;
      break;
    case "Banner":
    case "Button":
      raw = props.href;
      break;
    default:
      return null;
  }
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export interface PuckBlock {
  type: string;
  props: unknown;
}

/**
 * Yield every block under a parsed Puck data tree. Walks `content[]` and
 * every `zones[<id>][]` array. Tolerant to malformed input — returns [] for
 * non-objects, missing arrays, etc. Today's Puck data is flat (no block
 * recursively contains its own Puck tree), so the visitor is non-recursive;
 * if that ever changes, swap `visitArray` for a depth-bounded recursion.
 */
export function walkContentJson(parsed: unknown): PuckBlock[] {
  const out: PuckBlock[] = [];
  if (!parsed || typeof parsed !== "object") return out;
  const root = parsed as Record<string, unknown>;

  const visitArray = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).type === "string"
      ) {
        out.push(item as PuckBlock);
      }
    }
  };

  visitArray(root.content);

  const zones = root.zones;
  if (zones && typeof zones === "object") {
    for (const key of Object.keys(zones)) {
      visitArray((zones as Record<string, unknown>)[key]);
    }
  }

  return out;
}

/**
 * Resolve the canonical public URL for a Backlinks target. Mirrors the
 * route logic: pages and non-spike posts → `/<slug>`; spike posts →
 * `/<parentSlug>/<slug>`. A spike with a missing parentSlug falls back to
 * `/<slug>` so the modal still opens.
 */
export function resolveTargetUrl(target: {
  kind: InboundLinkSourceKind;
  slug: string;
  postKind?: InboundPostKind;
  parentSlug?: string | null;
}): string {
  if (
    target.kind === "post" &&
    target.postKind === "spike" &&
    target.parentSlug
  ) {
    return `/${target.parentSlug}/${target.slug}`;
  }
  return `/${target.slug}`;
}

/**
 * For a single source's blocks, return whether any RichText anchor and any
 * CTA href point at the target. Counts each kind at most once per source —
 * a TOC widget emitting 8 anchors to the same page contributes 1, not 8.
 */
export function collectHitsForSource(
  blocks: PuckBlock[],
  matchPath: string,
  originHost: string,
): { richtext: number; cta: number } {
  let hasRichText = false;
  let hasCta = false;
  for (const block of blocks) {
    if (block.type === "RichText") {
      const props = block.props as { html?: unknown };
      if (typeof props?.html === "string") {
        const hrefs = extractRichTextHrefs(props.html);
        if (hrefs.some((h) => normalizeUrl(h, originHost) === matchPath)) {
          hasRichText = true;
        }
      }
    } else {
      const cta = getCtaHref(block);
      if (cta && normalizeUrl(cta, originHost) === matchPath) {
        hasCta = true;
      }
    }
    if (hasRichText && hasCta) break;
  }
  return { richtext: hasRichText ? 1 : 0, cta: hasCta ? 1 : 0 };
}

const PILLAR_BG_CLASSES = [
  "bg-blue-50",
  "bg-amber-50",
  "bg-emerald-50",
  "bg-violet-50",
  "bg-rose-50",
] as const;

const STANDALONE_BG_CLASS = "bg-slate-50";

interface MutableGroup {
  key: string;
  label: string;
  bgClass: string;
  links: InboundLink[];
}

/**
 * Group inbound links by pillar with the "Standalone & Pages" residual
 * bucket last. Pillar bg-class is deterministic by `pillarId % palette.size`
 * — same pillar always gets the same color across reloads.
 */
export function groupByPillar(links: InboundLink[]): InboundLinkGroup[] {
  const byKey = new Map<string, MutableGroup>();

  const ensure = (
    key: string,
    label: string,
    bgClass: string,
  ): MutableGroup => {
    let g = byKey.get(key);
    if (!g) {
      g = { key, label, bgClass, links: [] };
      byKey.set(key, g);
    }
    return g;
  };

  for (const link of links) {
    const s = link.source;
    if (s.kind === "post" && s.postKind === "pillar") {
      ensure(
        `pillar-${s.id}`,
        s.title,
        PILLAR_BG_CLASSES[s.id % PILLAR_BG_CLASSES.length],
      ).links.push(link);
    } else if (
      s.kind === "post" &&
      s.postKind === "spike" &&
      s.parentId != null
    ) {
      ensure(
        `pillar-${s.parentId}`,
        s.parentTitle ?? "Pillar",
        PILLAR_BG_CLASSES[s.parentId % PILLAR_BG_CLASSES.length],
      ).links.push(link);
    } else {
      ensure(
        "standalone-pages",
        "Standalone & Pages",
        STANDALONE_BG_CLASS,
      ).links.push(link);
    }
  }

  const groups = Array.from(byKey.values());
  groups.sort((a, b) => {
    if (a.key === "standalone-pages") return 1;
    if (b.key === "standalone-pages") return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}
