// Pure helpers for the SEO audit script. Kept separate from `seo-audit.ts`
// so they can be unit-tested without spinning up Drizzle / next-auth /
// fetch — none of these helpers touch the network or the runtime DB
// instance directly.

export interface ParsedHead {
  title: string | null;
  /** Keyed by `name=` / `property=` / `http-equiv=`. Lowercase. */
  metas: Map<string, string>;
  canonical: string | null;
  /** Raw JSON strings, parsed by `extractJsonLd`. */
  jsonLdBlocks: string[];
}

export type CheckKind =
  | "title"
  | "description"
  | "og-title"
  | "og-description"
  | "og-image"
  | "og-url"
  | "og-type"
  | "twitter-title"
  | "twitter-description"
  | "twitter-image"
  | "canonical"
  | "robots"
  | "jsonld-presence"
  | "jsonld-image-consistency";

export interface CheckResult {
  kind: CheckKind;
  status: "pass" | "fail" | "skip";
  expected?: string;
  actual?: string;
  message?: string;
}

export interface UrlAuditReport {
  url: string;
  resolvedKind: "page" | "post" | "topic" | "homepage" | "unknown";
  resolvedId: number | null;
  checks: CheckResult[];
}

export interface AuditReport {
  baseUrl: string;
  fetchedAt: string;
  urls: UrlAuditReport[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

// ---------------------------------------------------------------------------
// parseHtmlHead — extract <title>, metas, canonical, JSON-LD blocks
// ---------------------------------------------------------------------------

const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const META_RE = /<meta\b([^>]*)>/gi;
const ATTR_RE = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
const CANONICAL_RE = /<link\b[^>]*\brel\s*=\s*"canonical"[^>]*>/i;
const HREF_RE = /\bhref\s*=\s*"([^"]*)"/i;
const JSONLD_RE =
  /<script\b[^>]*\btype\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(s)) !== null) out[m[1].toLowerCase()] = m[2];
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseHtmlHead(html: string): ParsedHead {
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;

  const metas = new Map<string, string>();
  META_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = META_RE.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]);
    const key = attrs.name ?? attrs.property ?? attrs["http-equiv"];
    if (key && attrs.content != null) {
      metas.set(key.toLowerCase(), decodeEntities(attrs.content));
    }
  }

  const canonicalTag = html.match(CANONICAL_RE);
  const hrefMatch = canonicalTag ? canonicalTag[0].match(HREF_RE) : null;
  const canonical = hrefMatch ? decodeEntities(hrefMatch[1]) : null;

  const jsonLdBlocks: string[] = [];
  JSONLD_RE.lastIndex = 0;
  while ((m = JSONLD_RE.exec(html)) !== null) jsonLdBlocks.push(m[1].trim());

  return { title, metas, canonical, jsonLdBlocks };
}

// ---------------------------------------------------------------------------
// extractJsonLd — parse + flatten JSON-LD blocks (handles @graph nesting)
// ---------------------------------------------------------------------------

export function extractJsonLd(
  blocks: string[],
): Array<{ type: string; data: Record<string, unknown> }> {
  const out: Array<{ type: string; data: Record<string, unknown> }> = [];
  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;
    const graph = obj["@graph"];
    if (Array.isArray(graph)) {
      for (const entry of graph) {
        if (entry && typeof entry === "object") {
          const t = (entry as Record<string, unknown>)["@type"];
          if (typeof t === "string") {
            out.push({ type: t, data: entry as Record<string, unknown> });
          }
        }
      }
    } else {
      const t = obj["@type"];
      if (typeof t === "string") {
        out.push({ type: t, data: obj });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolveUrlToDbRow — map sitemap URL → posts/pages/topics row
// ---------------------------------------------------------------------------

/** Subset of the libSQL Client surface used by the audit helpers. Narrow
 *  enough that the real Client is structurally assignable, broad enough
 *  for the mock used in unit tests. Args must be `InValue`-compatible. */
export interface MinimalDb {
  execute(input: {
    sql: string;
    args: Array<string | number | bigint | boolean | null>;
  }): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function resolveUrlToDbRow(
  loc: string,
  baseUrl: string,
  db: MinimalDb,
): Promise<{
  kind: "page" | "post" | "topic" | "homepage";
  id: number | null;
  row: Record<string, unknown> | null;
} | null> {
  const u = new URL(loc, baseUrl);
  const path = u.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { kind: "homepage", id: null, row: null };

  if (path.startsWith("/topics/")) {
    const slug = path.slice("/topics/".length);
    const r = await db.execute({
      sql: "SELECT id, slug, name, description FROM topics WHERE tenant_id=1 AND slug=? LIMIT 1",
      args: [slug],
    });
    if (r.rows[0]) return { kind: "topic", id: Number(r.rows[0].id), row: r.rows[0] };
    return null;
  }

  const segs = path.replace(/^\//, "").split("/");

  if (segs.length === 1) {
    const slug = segs[0];
    const pageR = await db.execute({
      sql: "SELECT * FROM pages WHERE tenant_id=1 AND status='published' AND trashed_at IS NULL AND slug=? LIMIT 1",
      args: [slug],
    });
    if (pageR.rows[0]) return { kind: "page", id: Number(pageR.rows[0].id), row: pageR.rows[0] };
    const postR = await db.execute({
      sql: "SELECT p.* FROM posts p WHERE p.tenant_id=1 AND p.status='published' AND p.trashed_at IS NULL AND p.parent_id IS NULL AND p.slug=? LIMIT 1",
      args: [slug],
    });
    if (postR.rows[0]) return { kind: "post", id: Number(postR.rows[0].id), row: postR.rows[0] };
    return null;
  }

  if (segs.length === 2) {
    const [parentSlug, spikeSlug] = segs;
    const r = await db.execute({
      sql: `SELECT p.* FROM posts p
            JOIN posts parent ON parent.id = p.parent_id AND parent.slug = ?
            WHERE p.tenant_id=1 AND p.status='published' AND p.trashed_at IS NULL AND p.slug=? LIMIT 1`,
      args: [parentSlug, spikeSlug],
    });
    if (r.rows[0]) return { kind: "post", id: Number(r.rows[0].id), row: r.rows[0] };
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// runChecks — produce CheckResult[] for one URL given parsed inputs
// ---------------------------------------------------------------------------

export interface RunChecksInput {
  kind: "page" | "post" | "topic" | "homepage";
  url: string;
  baseUrl: string;
  head: ParsedHead;
  jsonLd: Array<{ type: string; data: Record<string, unknown> }>;
  row: Record<string, unknown> | null;
  /** Suffix appended to the page title (e.g. " | NextPress"). Caller reads
   *  this from the `seo.title_suffix` setting. */
  titleSuffix: string;
}

function checkMeta(kind: CheckKind, actual: string | undefined, expected: string): CheckResult {
  return {
    kind,
    status: actual === expected ? "pass" : "fail",
    expected,
    actual: actual ?? "(missing)",
  };
}

/** Absolutize a `/media/...` style path against the base URL. Pass-through
 *  for already-absolute http(s) URLs and for null. */
function toAbsolute(raw: string | null, baseUrl: string): string | null {
  if (raw == null) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return baseUrl.replace(/\/$/, "") + raw;
  return raw;
}

export function runChecks(input: RunChecksInput): CheckResult[] {
  const { url, baseUrl, head, jsonLd, row, titleSuffix } = input;
  const out: CheckResult[] = [];

  if (!row) return out;

  const seoTitle = (row.seo_title as string | null) ?? null;
  const naturalTitle = (row.title as string | null) ?? (row.name as string | null) ?? "";
  const expectedTitleBase = seoTitle || naturalTitle;
  const expectedTitle = expectedTitleBase + titleSuffix;
  // og:title and twitter:title mirror <title> verbatim per common SEO
  // practice (search engines / social cards display them identically).
  out.push({
    kind: "title",
    status: head.title === expectedTitle ? "pass" : "fail",
    expected: expectedTitle,
    actual: head.title ?? "(missing)",
  });

  const seoDescription = (row.seo_description as string | null) ?? null;
  const excerpt = (row.excerpt as string | null) ?? null;
  const description = (row.description as string | null) ?? null;
  const expectedDesc = seoDescription ?? excerpt ?? description ?? null;
  if (expectedDesc !== null && expectedDesc.length > 0) {
    out.push({
      kind: "description",
      status: head.metas.get("description") === expectedDesc ? "pass" : "fail",
      expected: expectedDesc,
      actual: head.metas.get("description") ?? "(missing)",
    });
  } else {
    out.push({ kind: "description", status: "skip", message: "no description source" });
  }

  out.push(checkMeta("og-title", head.metas.get("og:title"), expectedTitle));
  if (expectedDesc !== null && expectedDesc.length > 0) {
    out.push(checkMeta("og-description", head.metas.get("og:description"), expectedDesc));
  }
  // og:image MUST be absolute per the Open Graph spec — compare absolute
  // forms so a /media/<uuid> stored value passes when rendered as a
  // fully-qualified URL.
  const ogImageRaw =
    (row.seo_og_image as string | null) ?? (row.featured_image as string | null) ?? null;
  const ogImageAbs = toAbsolute(ogImageRaw, baseUrl);
  if (ogImageAbs) {
    out.push(checkMeta("og-image", head.metas.get("og:image"), ogImageAbs));
  }
  out.push(checkMeta("og-url", head.metas.get("og:url"), url));

  out.push(checkMeta("twitter-title", head.metas.get("twitter:title"), expectedTitle));
  if (expectedDesc !== null && expectedDesc.length > 0) {
    out.push(
      checkMeta("twitter-description", head.metas.get("twitter:description"), expectedDesc),
    );
  }
  if (ogImageAbs) {
    out.push(checkMeta("twitter-image", head.metas.get("twitter:image"), ogImageAbs));
  }

  const expectedCanonical = ((row.seo_canonical as string | null) ?? null) || url;
  out.push({
    kind: "canonical",
    status: head.canonical === expectedCanonical ? "pass" : "fail",
    expected: expectedCanonical,
    actual: head.canonical ?? "(missing)",
  });

  const expectedRobots = (row.seo_robots as string | null) ?? "index,follow";
  out.push({
    kind: "robots",
    status:
      (head.metas.get("robots") ?? "index,follow") === expectedRobots ? "pass" : "fail",
    expected: expectedRobots,
    actual: head.metas.get("robots") ?? "(default)",
  });

  const requiredTypes: string[] = [];
  const rawTypes = row.schema_types;
  if (typeof rawTypes === "string" && rawTypes.length > 0) {
    try {
      const parsed = JSON.parse(rawTypes);
      if (Array.isArray(parsed)) {
        requiredTypes.push(...parsed.filter((t) => typeof t === "string"));
      }
    } catch {
      // If schema_types is malformed, the missing JSON-LD will be caught below
      // (no entries to require). Surface it as a single fail so it's visible.
      out.push({
        kind: "jsonld-presence",
        status: "fail",
        message: "schema_types column is not valid JSON",
        actual: String(rawTypes),
      });
    }
  }
  for (const t of requiredTypes) {
    out.push({
      kind: "jsonld-presence",
      status: jsonLd.some((b) => b.type === t) ? "pass" : "fail",
      expected: t,
      actual: jsonLd.map((b) => b.type).join(",") || "(none)",
    });
  }

  if (ogImageAbs) {
    const articleLike = jsonLd.find((b) => b.data.image != null);
    if (articleLike) {
      // JSON-LD image fields can be string or { url, ... } — extract.
      const raw = articleLike.data.image;
      const lhsRaw =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object" && typeof (raw as { url?: unknown }).url === "string"
            ? (raw as { url: string }).url
            : String(raw);
      const lhsAbs = toAbsolute(lhsRaw, baseUrl);
      out.push({
        kind: "jsonld-image-consistency",
        status: lhsAbs === ogImageAbs ? "pass" : "fail",
        expected: ogImageAbs,
        actual: lhsAbs ?? "(unparseable)",
      });
    }
  }

  return out;
}
