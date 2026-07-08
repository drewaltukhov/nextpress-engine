/**
 * XML/text generators for SEO routes.
 *
 * All generators produce valid output even when no content exists (skeleton
 * phase). When posts ship, these generators will query the posts table and
 * apply indexability rules.
 */

/**
 * Single-file sitemap. We emit a flat <urlset> rather than a
 * <sitemapindex> + child sitemaps because the personal-scale stack is
 * comfortably under the 50k-URL/50MB ceiling per the sitemaps.org spec.
 * When the site outgrows that — or when the posts plugin ships and starts
 * adding tens of thousands of URLs — split into a sitemapindex + per-type
 * children (`/sitemap/posts-N.xml`, etc.) and convert this back to an
 * index generator.
 *
 * Each entry is optional: pass `undefined` for a section to omit it. The
 * route handler decides which sections to emit based on the per-content-
 * type include flags from `seo.sitemap_include`.
 */
export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function generateSitemap(urls: SitemapUrl[]): string {
  const entries = urls
    .filter((u) => u.loc.length > 0)
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (typeof u.priority === "number") {
        parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      }
      return ["  <url>", ...parts, "  </url>"].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Helpers for callers that want to emit common entry shapes without
 * hand-rolling the SitemapUrl literal.
 */
export const sitemap = {
  toIsoDate,
};

/**
 * Named AI crawlers / agents we emit explicit robots.txt rules for when the
 * "Discourage AI agents" toggle is on. Advisory only — these are the bots
 * that publicly document a User-agent token and claim to honor robots.txt.
 * Add new tokens here as vendors publish them; the admin toggle stays a single
 * switch (a future per-bot checklist can iterate this list without rework).
 */
export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot", // OpenAI — training
  "OAI-SearchBot", // OpenAI — search
  "ChatGPT-User", // OpenAI — user-initiated fetch
  "ClaudeBot", // Anthropic — training
  "anthropic-ai", // Anthropic — legacy token
  "Claude-Web", // Anthropic — user-initiated fetch
  "Google-Extended", // Google — Gemini/Vertex training
  "PerplexityBot", // Perplexity — index
  "Perplexity-User", // Perplexity — user-initiated fetch
  "CCBot", // Common Crawl (widely used as a training corpus)
  "Bytespider", // ByteDance
  "Amazonbot", // Amazon
  "Applebot-Extended", // Apple — AI training opt-out token
  "Meta-ExternalAgent", // Meta — AI training
  "cohere-ai", // Cohere
  "Diffbot", // Diffbot
] as const;

/**
 * The block of per-bot stanzas prepended to robots.txt when AI agents are
 * discouraged. Each named crawler gets `Disallow: /`.
 */
function aiCrawlerDisallowBlock(agents: readonly string[]): string {
  const stanzas = agents.map((ua) => `User-agent: ${ua}\nDisallow: /`).join("\n\n");
  return ["# AI crawler access is disabled in site settings.", stanzas].join("\n");
}

/**
 * Content-Signal directive (https://contentsignals.org) — a machine-readable
 * usage policy carried inside a robots.txt group. Complements the per-bot
 * Disallow stanzas: it also reaches AI systems that aren't on the named list.
 * `ai-input`/`ai-train` are only emitted as opt-outs; when AI agents aren't
 * discouraged we stay silent rather than granting an explicit "yes".
 */
function contentSignalLine(opts: { search: boolean; allowAi: boolean }): string {
  const signals = [`search=${opts.search ? "yes" : "no"}`];
  if (!opts.allowAi) signals.push("ai-input=no", "ai-train=no");
  return `Content-Signal: ${signals.join(", ")}`;
}

/** User-agent tokens that already have their own group in a robots.txt body. */
function mentionedUserAgents(content: string): Set<string> {
  const tokens = new Set<string>();
  for (const line of content.split("\n")) {
    const match = /^\s*user-agent\s*:\s*(.+?)\s*$/i.exec(line);
    if (match) tokens.add(match[1].toLowerCase());
  }
  return tokens;
}

/**
 * Generate robots.txt content. Respects a custom override from site_settings.
 *
 * Precedence: discourageIndexing (admin toggle) > isStaging (env) > body.
 * The admin toggle wins over staging so a "real" production site can still
 * be force-disallowed from the UI without env edits. Both of those paths
 * already block everyone (`User-agent: *` / `Disallow: /`), so AI bots are
 * implicitly covered and we skip the per-bot stanzas to avoid redundancy.
 *
 * Otherwise the body is the custom override (or the default), and when
 * `discourageAiAgents` is on the named AI-bot stanzas are prepended — so the
 * AI block holds even when a custom robots.txt is set.
 */
export function generateRobotsTxt(opts: {
  siteUrl: string;
  customContent?: string | null;
  isStaging?: boolean;
  discourageIndexing?: boolean;
  discourageAiAgents?: boolean;
}): string {
  if (opts.discourageIndexing) {
    return [
      "User-agent: *",
      "Disallow: /",
      contentSignalLine({ search: false, allowAi: false }),
      "",
      "# Search-engine indexing is disabled in site settings.",
    ].join("\n");
  }

  if (opts.isStaging) {
    return [
      "User-agent: *",
      "Disallow: /",
      contentSignalLine({ search: false, allowAi: false }),
      "",
      `# Staging environment — all crawling blocked`,
      `# Sitemap: ${opts.siteUrl}/sitemap.xml`
    ].join("\n");
  }

  const body = opts.customContent
    ? opts.customContent
    : [
        "User-agent: *",
        "Allow: /",
        contentSignalLine({ search: true, allowAi: !opts.discourageAiAgents }),
        "",
        "# Admin paths",
        "Disallow: /admin/",
        "Disallow: /api/",
        "",
        `Sitemap: ${opts.siteUrl}/sitemap.xml`,
      ].join("\n");

  if (opts.discourageAiAgents) {
    // Respect explicit carve-outs: skip stanzas for any token the custom
    // content already addresses, so an owner's own group for a bot (e.g. an
    // Allow rule) isn't contradicted by a prepended blanket Disallow —
    // duplicate groups for one token mean different things to different
    // parsers (RFC 9309 merges them; first-match parsers take only ours).
    const mentioned = opts.customContent
      ? mentionedUserAgents(opts.customContent)
      : new Set<string>();
    const agents = AI_CRAWLER_USER_AGENTS.filter((ua) => !mentioned.has(ua.toLowerCase()));
    if (agents.length === 0) return body;
    return [aiCrawlerDisallowBlock(agents), "", body].join("\n");
  }

  return body;
}

/**
 * Generate an RSS 2.0 feed. Currently returns a valid empty feed.
 * When posts ship, it will include recent published posts.
 */
export function generateRssFeed(opts: {
  siteUrl: string;
  siteTitle: string;
  siteDescription?: string;
  items?: RssItem[];
}): string {
  const items = opts.items ?? [];
  const itemsXml = items.map((item) => [
    "    <item>",
    `      <title><![CDATA[${item.title}]]></title>`,
    `      <link>${item.url}</link>`,
    `      <guid isPermaLink="true">${item.url}</guid>`,
    `      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>`,
    item.description ? `      <description><![CDATA[${item.description}]]></description>` : "",
    item.author ? `      <author>${item.author}</author>` : "",
    "    </item>"
  ].filter(Boolean).join("\n")).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title><![CDATA[${opts.siteTitle}]]></title>`,
    `    <link>${opts.siteUrl}</link>`,
    `    <description><![CDATA[${opts.siteDescription ?? ""}]]></description>`,
    `    <language>en</language>`,
    `    <atom:link href="${opts.siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>`,
    itemsXml,
    "  </channel>",
    "</rss>"
  ].join("\n");
}

export interface RssItem {
  title: string;
  url: string;
  publishedAt: string;
  description?: string;
  author?: string;
}
