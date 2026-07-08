import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { registerCache, getCached, invalidateCache } from "@core/cache/plugin-cache";
import {
  COUNTRY_BY_CODE,
  DEFAULT_COUNTRY,
  DEFAULT_HEADLINE_COUNT,
  DEFAULT_REFRESH_INTERVAL_MIN,
  LANGUAGE_AUTO,
  LANGUAGE_BY_CODE,
  MAX_HEADLINE_COUNT,
  type NewsHeadline,
} from "./types";

const CACHE_KEY_PREFIX = "google-news";
// Hard cap so we never balloon a payload no matter how the user fiddles
// with refresh_interval_min — Google returns ~100 items per feed.
const MAX_FETCH = 30;

const registeredCacheKeys = new Set<string>();

/**
 * Compose the Google News RSS URL for a (country, language) pair.
 * `language === ""` means "use the country's baked-in default" — preserves
 * pre-language-picker behavior exactly. Otherwise we override `hl` and
 * recompose `ceid` as `<country.gl>:<language.code>`.
 */
function buildFeedUrl(countryCode: string, languageCode: string): string {
  const c = COUNTRY_BY_CODE[countryCode] ?? COUNTRY_BY_CODE[DEFAULT_COUNTRY];
  const lang = languageCode && LANGUAGE_BY_CODE[languageCode];
  const hl = encodeURIComponent(lang ? lang.hl : c.hl);
  const gl = encodeURIComponent(c.gl);
  const ceid = encodeURIComponent(lang ? `${c.gl}:${lang.code}` : c.ceid);
  return `https://news.google.com/rss?hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function unwrapCdata(s: string): string {
  const m = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return m ? m[1] : s;
}

function pickTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? unwrapCdata(m[1]).trim() : "";
}

function pickSource(item: string): string {
  // <source url="...">Source Name</source>
  const m = item.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
  return m ? decodeEntities(unwrapCdata(m[1]).trim()) : "";
}

function splitTitle(title: string, source: string): string {
  // Google News appends " - Source" to most titles. Strip it when the
  // suffix matches the <source> tag so the headline stands on its own.
  if (!source) return decodeEntities(title);
  const suffix = ` - ${source}`;
  if (title.endsWith(suffix)) {
    return decodeEntities(title.slice(0, -suffix.length).trim());
  }
  return decodeEntities(title);
}

function toIsoDate(rfc822: string): string {
  if (!rfc822) return "";
  const t = Date.parse(rfc822);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString();
}

/** Parse RSS 2.0 <item> blocks into headline objects, sorted newest-first. */
function parseFeed(xml: string, limit: number): NewsHeadline[] {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const out: NewsHeadline[] = [];
  for (const raw of items) {
    const source = pickSource(raw);
    const titleRaw = pickTag(raw, "title");
    const title = splitTitle(titleRaw, source);
    if (!title) continue;
    out.push({
      id: pickTag(raw, "guid") || pickTag(raw, "link"),
      title,
      link: pickTag(raw, "link"),
      source,
      publishedAt: toIsoDate(pickTag(raw, "pubDate")),
    });
  }
  // Google News doesn't guarantee feed order matches recency. Sort all parsed
  // items by pubDate DESC, then slice — slicing first would risk dropping
  // genuinely newer items that landed later in the feed. Empty pubDates sink.
  out.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return out.slice(0, limit);
}

async function fetchHeadlines(country: string, language: string, limit: number): Promise<NewsHeadline[]> {
  const url = buildFeedUrl(country, language);
  const res = await fetch(url, {
    headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseFeed(xml, Math.min(MAX_FETCH, Math.max(1, limit)));
}

function cacheKeyFor(country: string, language: string): string {
  // `language` may be "" (auto). Include it in the key so an explicit
  // language and the auto-default never share a slot — even if they
  // currently produce the same URL.
  return `${CACHE_KEY_PREFIX}:${country}:${language || "_"}`;
}

/**
 * Register a (country, language) cache slot lazily. Each combination gets its
 * own slot so switching either country or language never returns stale data
 * from the previous selection.
 */
function ensureCacheRegistered(
  db: DbClient,
  country: string,
  language: string,
  ttlMinutes: number
): void {
  const key = cacheKeyFor(country, language);
  if (registeredCacheKeys.has(key)) return;
  registeredCacheKeys.add(key);
  registerCache<NewsHeadline[]>({
    key,
    ttlMs: Math.max(1, ttlMinutes) * 60 * 1000,
    // Persist the active (country, language) payload — switching invalidates
    // and refetches, so the persisted slot always matches the current pick.
    settingsDataKey: "google-news.cached_data",
    settingsTimestampKey: "google-news.last_fetched",
    fetcher: async () => {
      const count = (await getSetting<number>(db, "google-news.headline_count"))
        ?? DEFAULT_HEADLINE_COUNT;
      return fetchHeadlines(country, language, Math.min(MAX_HEADLINE_COUNT, Math.max(1, count)));
    },
  });
}

export async function getCachedOrFreshHeadlines(db: DbClient): Promise<NewsHeadline[]> {
  const [country, language, ttl] = await Promise.all([
    getSetting<string>(db, "google-news.country"),
    getSetting<string>(db, "google-news.language"),
    getSetting<number>(db, "google-news.refresh_interval_min"),
  ]);
  const c = country && COUNTRY_BY_CODE[country] ? country : DEFAULT_COUNTRY;
  const l = language && LANGUAGE_BY_CODE[language] ? language : LANGUAGE_AUTO;
  const t = ttl ?? DEFAULT_REFRESH_INTERVAL_MIN;
  ensureCacheRegistered(db, c, l, t);
  const rows = await getCached<NewsHeadline[]>(cacheKeyFor(c, l), db);
  return rows ?? [];
}

/**
 * Drop every country-specific cache slot. Called from settings save actions
 * so the next render fetches fresh — even if the user changed country.
 */
export function clearGoogleNewsCache(): void {
  for (const key of registeredCacheKeys) {
    invalidateCache(key);
  }
}
