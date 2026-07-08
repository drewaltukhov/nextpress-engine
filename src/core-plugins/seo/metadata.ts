/**
 * SeoMetadata type + helpers for generating per-page metadata.
 *
 * Every public RSC page returns a SeoMetadata object that drives:
 *   - <head> meta/OG tags via Next.js generateMetadata
 *   - JSON-LD <script> blocks
 *   - Breadcrumb structured data
 *
 * This is the scaffolding — real per-page generation wires in when posts ship.
 */

export interface OgMeta {
  title: string;
  description: string;
  image?: string;
  type: "website" | "article";
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  noindex?: boolean;
  og: OgMeta;
  jsonLd: object[];
  breadcrumbs: BreadcrumbItem[];
  alternates?: Array<{ hreflang: string; href: string }>;
}

/**
 * Render a `<title>` from the site-wide `seo.title_format` template.
 *
 * Tokens:
 *   - `%title%`   — the page-specific title (post/page/topic/etc.)
 *   - `%site%`    — the site title (`site.title`)
 *   - `%tagline%` — the site tagline (`site.tagline`); empty string when not configured
 *   - `%sep%`     — a typographic em-dash (—) for owners who want a separator token
 *
 * Every public route that builds `<title>` should go through this helper
 * so users get a consistent shape across posts, pages, topics, search,
 * author pages, and the homepage. Pass an empty/whitespace tagline if
 * you don't have it loaded — `%tagline%` resolves to "" in that case.
 */
export function renderTitleFormat(
  format: string,
  opts: { pageTitle: string; siteTitle: string; siteTagline?: string },
): string {
  return format
    .replaceAll("%title%", opts.pageTitle)
    .replaceAll("%site%", opts.siteTitle)
    .replaceAll("%tagline%", opts.siteTagline ?? "")
    .replaceAll("%sep%", "—")
    .trim();
}

/**
 * Generate a BreadcrumbList JSON-LD node from breadcrumb items.
 *
 * Per Google Search Central's spec, the `item` URL is required on every
 * step *except the last* — the current page. Omitting it on the last
 * entry is the canonical pattern in Google's docs and lets the crawler
 * use the containing page URL automatically. Callers shouldn't need to
 * worry about this; we strip it here based on position.
 *
 * Google also requires at least two ListItems for the breadcrumb to be
 * eligible for the rich result, so callers with a single-item trail
 * (e.g. the homepage) should skip emitting the node altogether rather
 * than relying on this helper to produce something useful.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): object {
  const last = items.length - 1;
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(i === last ? {} : { item: item.url }),
    })),
  };
}

/**
 * Wrap JSON-LD nodes in a @graph container with schema.org context.
 */
export function wrapJsonLdGraph(nodes: object[]): object {
  return {
    "@context": "https://schema.org",
    "@graph": nodes
  };
}

/**
 * Build a basic WebSite JSON-LD node (emitted on the homepage).
 *
 * Includes a `potentialAction: SearchAction` pointing at the engine's
 * always-on `/search?q=…` route so Google can wire up the sitelinks
 * search box for the site without further configuration.
 */
export function webSiteJsonLd(opts: { name: string; url: string; description?: string }): object {
  const base = opts.url.replace(/\/+$/, "");
  return {
    "@type": "WebSite",
    name: opts.name,
    url: opts.url,
    ...(opts.description ? { description: opts.description } : {}),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Build an Organization / Person / LocalBusiness JSON-LD node from the
 * stored `seo.identity_data` setting.
 */
export type IdentityData =
  | {
      type: "organization";
      name: string;
      logo: string;
      description: string;
      sameAs: string[];
      contactEmail: string;
      contactPhone: string;
    }
  | {
      type: "person";
      name: string;
      jobTitle: string;
      photo: string;
      sameAs: string[];
    }
  | {
      type: "local_business";
      name: string;
      streetAddress: string;
      addressLocality: string;
      addressRegion: string;
      postalCode: string;
      addressCountry: string;
      telephone: string;
      priceRange: string;
      openingHours: string;
      latitude: string;
      longitude: string;
    };

export function identityJsonLd(data: IdentityData, siteUrl: string): object | null {
  const url = siteUrl || undefined;

  if (data.type === "organization") {
    if (!data.name) return null;
    const node: Record<string, unknown> = {
      "@type": "Organization",
      name: data.name,
    };
    if (url) node.url = url;
    const logo = resolveAbsoluteUrl(data.logo, siteUrl);
    if (logo) node.logo = logo;
    if (data.description) node.description = data.description;
    const sameAs = data.sameAs.filter(Boolean);
    if (sameAs.length) node.sameAs = sameAs;
    if (data.contactEmail || data.contactPhone) {
      node.contactPoint = {
        "@type": "ContactPoint",
        ...(data.contactEmail ? { email: data.contactEmail } : {}),
        ...(data.contactPhone ? { telephone: data.contactPhone } : {}),
        contactType: "customer support",
      };
    }
    return node;
  }

  if (data.type === "person") {
    if (!data.name) return null;
    const node: Record<string, unknown> = {
      "@type": "Person",
      name: data.name,
    };
    if (url) node.url = url;
    if (data.jobTitle) node.jobTitle = data.jobTitle;
    const photo = resolveAbsoluteUrl(data.photo, siteUrl);
    if (photo) node.image = photo;
    const sameAs = data.sameAs.filter(Boolean);
    if (sameAs.length) node.sameAs = sameAs;
    return node;
  }

  // local_business
  if (!data.name) return null;
  const node: Record<string, unknown> = {
    "@type": "LocalBusiness",
    name: data.name,
  };
  if (url) node.url = url;
  if (data.telephone) node.telephone = data.telephone;
  if (data.priceRange) node.priceRange = data.priceRange;
  if (
    data.streetAddress ||
    data.addressLocality ||
    data.addressRegion ||
    data.postalCode ||
    data.addressCountry
  ) {
    node.address = {
      "@type": "PostalAddress",
      ...(data.streetAddress ? { streetAddress: data.streetAddress } : {}),
      ...(data.addressLocality ? { addressLocality: data.addressLocality } : {}),
      ...(data.addressRegion ? { addressRegion: data.addressRegion } : {}),
      ...(data.postalCode ? { postalCode: data.postalCode } : {}),
      ...(data.addressCountry ? { addressCountry: data.addressCountry } : {}),
    };
  }
  if (data.latitude && data.longitude) {
    node.geo = {
      "@type": "GeoCoordinates",
      latitude: data.latitude,
      longitude: data.longitude,
    };
  }
  // openingHours is a free-text multi-line input; split lines into an array.
  const hours = data.openingHours
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hours.length) node.openingHours = hours;
  return node;
}

/**
 * Build a FAQPage JSON-LD node from a list of {question, answer} pairs.
 * The Pages plugin's FAQ block contributes the items; the public route
 * walks the saved Puck data at render time and calls this. Returns null
 * when there are no usable items so callers can short-circuit cleanly.
 */
export function faqPageJsonLd(
  items: { question: string; answer: string }[],
): object | null {
  const cleaned = items
    .map((it) => ({ question: it.question.trim(), answer: it.answer.trim() }))
    .filter((it) => it.question && it.answer);
  if (cleaned.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: cleaned.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

/**
 * Coerce any date string we got from the DB / setting to ISO 8601.
 * libSQL hands us SQLite-native `2026-05-06 16:24:55` strings on some
 * columns; Schema.org prefers ISO 8601 so Google's rich-results validator
 * doesn't nag. Returns undefined on unparseable input so the caller can
 * drop the field entirely rather than emit garbage.
 */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Resolve a possibly-relative URL against the configured site URL. JSON-LD
 * payloads sit inside an inline <script> and don't pass through Next's
 * `metadataBase` resolution, so a `/media/<id>` reference would otherwise
 * land in the page literally. Returns the original value when siteUrl is
 * empty or the URL is already absolute.
 */
function resolveAbsoluteUrl(value: string | undefined, siteUrl: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (!siteUrl) return value;
  const base = siteUrl.replace(/\/$/, "");
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}

/**
 * Build an Article JSON-LD node. Extended by the posts plugin when it ships.
 *
 * Pass `siteUrl` so a relative image reference (e.g. `/media/<id>`, the
 * shape page rows store) gets resolved to an absolute URL before emit —
 * Schema.org expects absolute URLs and crawlers can't infer them from a
 * `<script>` payload the way Next can for `<meta>` tags.
 */
/**
 * Build a Person JSON-LD node — used by the public author profile page.
 * `@id` is set to the canonical author URL so a sibling ProfilePage
 * node can reference it via `mainEntity`. `image` runs through
 * `resolveAbsoluteUrl` so a `/media/{id}` avatar becomes a full URL
 * (Google's structured-data parser doesn't follow relative paths).
 */
export function personJsonLd(opts: {
  url: string;
  name: string;
  alternateName?: string;
  description?: string;
  image?: string;
  /** Profile URLs on other platforms — populates `sameAs`. Non-https
   *  values are filtered out. */
  sameAs?: string[];
  siteUrl?: string;
}): object {
  const image = resolveAbsoluteUrl(opts.image, opts.siteUrl);
  const sameAs = (opts.sameAs ?? []).filter((u) => /^https?:\/\//i.test(u));
  return {
    "@type": "Person",
    "@id": opts.url,
    name: opts.name,
    url: opts.url,
    ...(opts.alternateName ? { alternateName: opts.alternateName } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    ...(image ? { image } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Build a ProfilePage JSON-LD node referencing a sibling Person node
 * via `mainEntity`. Emit alongside `personJsonLd` in the same `@graph`
 * so `personId` resolves through the JSON-LD `@id` lookup table.
 */
export function profilePageJsonLd(opts: {
  url: string;
  name: string;
  /** The Person node's `@id` (typically the same as the page URL). */
  personId: string;
  description?: string;
}): object {
  return {
    "@type": "ProfilePage",
    url: opts.url,
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    mainEntity: { "@id": opts.personId },
  };
}

export function articleJsonLd(opts: {
  headline: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author?: { name: string; url?: string };
  description?: string;
  image?: string;
  siteUrl?: string;
}): object {
  const datePublishedIso = toIsoDate(opts.datePublished);
  const dateModifiedIso = toIsoDate(opts.dateModified);
  const image = resolveAbsoluteUrl(opts.image, opts.siteUrl);
  return {
    "@type": "Article",
    headline: opts.headline,
    url: opts.url,
    ...(datePublishedIso ? { datePublished: datePublishedIso } : {}),
    ...(dateModifiedIso ? { dateModified: dateModifiedIso } : {}),
    ...(opts.author ? {
      author: {
        "@type": "Person",
        name: opts.author.name,
        ...(opts.author.url ? { url: opts.author.url } : {})
      }
    } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    ...(image ? { image } : {})
  };
}
