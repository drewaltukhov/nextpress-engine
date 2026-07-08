import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";
import { SCHEMA_CATALOG_TYPES } from "./schema-catalog";

/**
 * SEO core-plugin — sitemap, robots.txt, RSS, JSON-LD structured data,
 * and the settings that drive them.
 *
 * Phase 7 (skeleton) shipped routes + helpers. This `register()` adds the
 * settings registry; the admin UI lives at /admin/seo.
 *
 * Per-page schemas:
 *  - WebSite + Organization render on the homepage today (gated by toggles).
 *  - Article / FAQ / BreadcrumbList toggles are pre-registered so the
 *    Posts/Pages plugins can read them when those plugins ship.
 */
export default function register(_api: PluginAPI): void {
  defineSettings([
    // ── General ──────────────────────────────────────────────────────────
    {
      key: "seo.title_format",
      group: "SEO",
      label: "Title format",
      description:
        "Tokens: %title% (page title), %site% (site title), %tagline%, %sep% (separator). Used as <title> on the homepage and as a fallback elsewhere.",
      schema: z.string().min(1).max(200),
      defaultValue: "%title% | %site%",
      scope: "public",
    },
    {
      key: "seo.default_description",
      group: "SEO",
      label: "Default meta description",
      description:
        "Used on the homepage and as a fallback for any page without its own description.",
      schema: z.string().max(500),
      defaultValue: "",
      scope: "public",
    },
    {
      key: "seo.language",
      group: "SEO",
      label: "Site language",
      description:
        "Tells browsers and search engines what language your site is in. Use a code like en, en-US, or de.",
      schema: z.string().min(2).max(10),
      defaultValue: "en",
      scope: "public",
    },
    {
      key: "seo.default_og_image",
      group: "SEO",
      label: "Default social image URL",
      description:
        "Fallback OG image when content has no featured image. Pick from the Media library or paste an absolute URL.",
      schema: z
        .string()
        .regex(/^(https?:\/\/.+|\/.+)$/, "Must be an absolute URL or a media path")
        .or(z.literal("")),
      defaultValue: "",
      scope: "public",
    },
    {
      key: "seo.og_site_name",
      group: "SEO",
      label: "Social-share site name",
      description:
        "Shown as the source when your site is shared on Facebook, LinkedIn, etc. Leave blank to use your Site title.",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "public",
    },
    {
      key: "seo.twitter_handle",
      group: "SEO",
      label: "Twitter / X handle",
      description:
        "Your Twitter/X username (with or without the @). Used when your posts are shared on Twitter.",
      schema: z.string().max(50),
      defaultValue: "",
      scope: "public",
    },

    // ── Sitemap ──────────────────────────────────────────────────────────
    {
      key: "seo.sitemap_enabled",
      group: "SEO",
      label: "Auto-generate sitemap",
      description: "When off, /sitemap.xml is no longer served to search engines.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public",
    },
    {
      key: "seo.sitemap_include",
      group: "SEO",
      label: "Sitemap content types",
      description: "Pick which content types appear in your sitemap.",
      schema: z.object({
        homepage: z.boolean(),
        posts: z.boolean(),
        pages: z.boolean(),
        topics: z.boolean(),
        authors: z.boolean(),
        media: z.boolean(),
      }).partial(),
      defaultValue: {
        homepage: true,
        posts: true,
        pages: true,
        topics: true,
        authors: true,
        media: false,
      },
      scope: "private",
    },

    // ── Robots & indexing ────────────────────────────────────────────────
    {
      key: "seo.discourage_indexing",
      group: "SEO",
      label: "Discourage search engines",
      description:
        "Master noindex toggle. When on, every public page emits noindex, robots.txt blocks all crawlers, and the sitemap returns 404. Use only on staging or unpublished sites — the #1 SEO footgun.",
      schema: z.boolean(),
      defaultValue: false,
      scope: "public",
    },
    {
      key: "seo.discourage_ai_agents",
      group: "SEO",
      label: "Discourage AI agents",
      description:
        "When on, robots.txt asks named AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, etc.) not to access the site, and /llms.txt returns 404. Advisory only — enforcement depends on each bot honoring robots.txt. Independent of search-engine indexing.",
      schema: z.boolean(),
      defaultValue: false,
      scope: "public",
    },
    {
      key: "seo.robots_custom",
      group: "SEO",
      label: "Custom robots.txt",
      description:
        "Override the generated robots.txt content. Leave blank to use the default. Ignored when 'Discourage search engines' is on.",
      schema: z.string().max(10000),
      defaultValue: "",
      scope: "private",
    },

    // ── Verification ─────────────────────────────────────────────────────
    {
      key: "seo.verification_google",
      group: "SEO",
      label: "Google Search Console verification token",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "seo.verification_bing",
      group: "SEO",
      label: "Bing Webmaster verification token",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "seo.verification_yandex",
      group: "SEO",
      label: "Yandex verification token",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "seo.verification_pinterest",
      group: "SEO",
      label: "Pinterest verification token",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "private",
    },

    // ── Identity (Organization JSON-LD) ──────────────────────────────────
    {
      key: "seo.identity_data",
      group: "SEO",
      label: "Site identity",
      description:
        "Drives the auto-generated Organization / Person / LocalBusiness JSON-LD on the homepage.",
      schema: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("organization"),
          name: z.string().max(200),
          logo: z.string().max(500),
          description: z.string().max(1000),
          sameAs: z.array(z.string().max(500)),
          contactEmail: z.string().max(200),
          contactPhone: z.string().max(50),
        }),
        z.object({
          type: z.literal("person"),
          name: z.string().max(200),
          jobTitle: z.string().max(200),
          photo: z.string().max(500),
          sameAs: z.array(z.string().max(500)),
        }),
        z.object({
          type: z.literal("local_business"),
          name: z.string().max(200),
          streetAddress: z.string().max(200),
          addressLocality: z.string().max(200),
          addressRegion: z.string().max(100),
          postalCode: z.string().max(50),
          addressCountry: z.string().max(100),
          telephone: z.string().max(50),
          priceRange: z.string().max(50),
          openingHours: z.string().max(500),
          latitude: z.string().max(50),
          longitude: z.string().max(50),
        }),
      ]),
      defaultValue: {
        type: "organization",
        name: "",
        logo: "",
        description: "",
        sameAs: [],
        contactEmail: "",
        contactPhone: "",
      },
      scope: "public",
    },

    // ── Per-page schema toggles ──────────────────────────────────────────
    {
      key: "seo.schema_website_enabled",
      group: "SEO",
      label: "Emit WebSite schema on homepage",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public",
    },
    {
      key: "seo.schema_breadcrumb_enabled",
      group: "SEO",
      label: "Emit BreadcrumbList schema",
      description:
        "Adds a breadcrumb trail (e.g. Home › Topic › Article) so search results can show your site structure.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public",
    },
    {
      key: "seo.schema_article_enabled",
      group: "SEO",
      label: "Emit Article schema on posts",
      description:
        "Marks each post as an article so Google can show it as a rich result with title, image, and date.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public",
    },
    // ── Installed schema catalog ─────────────────────────────────────────
    {
      key: "seo.enabled_schemas",
      group: "SEO",
      label: "Installed schemas",
      description:
        "Schema types your authors can pick from when writing a post or page. The site-wide ones (WebSite, BreadcrumbList, Organization) are managed automatically and aren't listed here.",
      schema: z
        .array(z.string())
        .refine(
          (arr) => arr.every((t) => SCHEMA_CATALOG_TYPES.has(t)),
          "Contains a schema type not in the curated catalog",
        ),
      defaultValue: [],
      scope: "public",
    },
  ]);
}

// Metadata types + JSON-LD helpers
export {
  breadcrumbJsonLd,
  wrapJsonLdGraph,
  webSiteJsonLd,
  articleJsonLd,
  faqPageJsonLd,
  identityJsonLd,
  type SeoMetadata,
  type OgMeta,
  type BreadcrumbItem,
  type IdentityData
} from "./metadata";

// XML/text generators
export {
  generateSitemap,
  generateRobotsTxt,
  generateRssFeed,
  type SitemapUrl,
  type RssItem
} from "./generators";
