/** A parsed news item from Google News RSS. */
export interface NewsHeadline {
  /** GUID from the RSS feed (stable per article, not a real URL). */
  id: string;
  /** Headline with the trailing " - Source" suffix stripped. */
  title: string;
  /** Article link (Google News redirect URL). */
  link: string;
  /** Publishing source name, e.g. "BBC", "Reuters". Empty when not provided. */
  source: string;
  /** ISO timestamp of the article's pubDate. */
  publishedAt: string;
}

/**
 * Curated Google News country edition.
 * `code` is the ISO-3166 alpha-2 country code we persist.
 * `hl` / `gl` / `ceid` are the Google News RSS query params.
 */
export interface NewsCountry {
  code: string;
  label: string;
  flag: string;
  hl: string;
  gl: string;
  ceid: string;
}

/**
 * ~30 markets covering the largest news editions Google publishes.
 * Sorted alphabetically by code so the dropdown order is predictable.
 */
export const COUNTRIES: NewsCountry[] = [
  { code: "AR", label: "Argentina",      flag: "🇦🇷", hl: "es-419", gl: "AR", ceid: "AR:es-419" },
  { code: "AU", label: "Australia",      flag: "🇦🇺", hl: "en-AU",  gl: "AU", ceid: "AU:en" },
  { code: "AT", label: "Austria",        flag: "🇦🇹", hl: "de",     gl: "AT", ceid: "AT:de" },
  { code: "BR", label: "Brazil",         flag: "🇧🇷", hl: "pt-BR",  gl: "BR", ceid: "BR:pt-419" },
  { code: "CA", label: "Canada",         flag: "🇨🇦", hl: "en-CA",  gl: "CA", ceid: "CA:en" },
  { code: "FR", label: "France",         flag: "🇫🇷", hl: "fr",     gl: "FR", ceid: "FR:fr" },
  { code: "DE", label: "Germany",        flag: "🇩🇪", hl: "de",     gl: "DE", ceid: "DE:de" },
  { code: "HK", label: "Hong Kong",      flag: "🇭🇰", hl: "zh-HK",  gl: "HK", ceid: "HK:zh-Hant" },
  { code: "IN", label: "India",          flag: "🇮🇳", hl: "en-IN",  gl: "IN", ceid: "IN:en" },
  { code: "ID", label: "Indonesia",      flag: "🇮🇩", hl: "id",     gl: "ID", ceid: "ID:id" },
  { code: "IE", label: "Ireland",        flag: "🇮🇪", hl: "en-IE",  gl: "IE", ceid: "IE:en" },
  { code: "IL", label: "Israel",         flag: "🇮🇱", hl: "he",     gl: "IL", ceid: "IL:he" },
  { code: "IT", label: "Italy",          flag: "🇮🇹", hl: "it",     gl: "IT", ceid: "IT:it" },
  { code: "JP", label: "Japan",          flag: "🇯🇵", hl: "ja",     gl: "JP", ceid: "JP:ja" },
  { code: "MX", label: "Mexico",         flag: "🇲🇽", hl: "es-419", gl: "MX", ceid: "MX:es-419" },
  { code: "NL", label: "Netherlands",    flag: "🇳🇱", hl: "nl",     gl: "NL", ceid: "NL:nl" },
  { code: "NZ", label: "New Zealand",    flag: "🇳🇿", hl: "en-NZ",  gl: "NZ", ceid: "NZ:en" },
  { code: "PL", label: "Poland",         flag: "🇵🇱", hl: "pl",     gl: "PL", ceid: "PL:pl" },
  { code: "PT", label: "Portugal",       flag: "🇵🇹", hl: "pt-PT",  gl: "PT", ceid: "PT:pt-150" },
  { code: "RU", label: "Russia",         flag: "🇷🇺", hl: "ru",     gl: "RU", ceid: "RU:ru" },
  { code: "SA", label: "Saudi Arabia",   flag: "🇸🇦", hl: "ar",     gl: "SA", ceid: "SA:ar" },
  { code: "ZA", label: "South Africa",   flag: "🇿🇦", hl: "en",     gl: "ZA", ceid: "ZA:en" },
  { code: "KR", label: "South Korea",    flag: "🇰🇷", hl: "ko",     gl: "KR", ceid: "KR:ko" },
  { code: "ES", label: "Spain",          flag: "🇪🇸", hl: "es",     gl: "ES", ceid: "ES:es" },
  { code: "CH", label: "Switzerland",    flag: "🇨🇭", hl: "de",     gl: "CH", ceid: "CH:de" },
  { code: "TW", label: "Taiwan",         flag: "🇹🇼", hl: "zh-TW",  gl: "TW", ceid: "TW:zh-Hant" },
  { code: "TH", label: "Thailand",       flag: "🇹🇭", hl: "th",     gl: "TH", ceid: "TH:th" },
  { code: "TR", label: "Turkey",         flag: "🇹🇷", hl: "tr",     gl: "TR", ceid: "TR:tr" },
  { code: "UA", label: "Ukraine",        flag: "🇺🇦", hl: "uk",     gl: "UA", ceid: "UA:uk" },
  { code: "AE", label: "United Arab Emirates", flag: "🇦🇪", hl: "ar", gl: "AE", ceid: "AE:ar" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧", hl: "en-GB",  gl: "GB", ceid: "GB:en" },
  { code: "US", label: "United States",  flag: "🇺🇸", hl: "en-US",  gl: "US", ceid: "US:en" },
  { code: "VN", label: "Vietnam",        flag: "🇻🇳", hl: "vi",     gl: "VN", ceid: "VN:vi" },
];

export const COUNTRY_BY_CODE: Record<string, NewsCountry> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

/**
 * Optional language override. When the user picks a language, the feed URL
 * is composed as `hl=<hl>&gl=<country.gl>&ceid=<country.gl>:<code>`.
 * `code` is what we persist; `hl` is what Google expects in the `hl` param.
 * Some country×language combos may not exist in Google News — Google falls
 * back to the country's default in that case.
 */
export interface NewsLanguage {
  code: string;
  label: string;
  flag: string;
  hl: string;
}

export const LANGUAGES: NewsLanguage[] = [
  { code: "ar",      label: "Arabic",                 flag: "🇸🇦", hl: "ar" },
  { code: "zh-Hans", label: "Chinese (Simplified)",   flag: "🇨🇳", hl: "zh-CN" },
  { code: "zh-Hant", label: "Chinese (Traditional)",  flag: "🇹🇼", hl: "zh-TW" },
  { code: "nl",      label: "Dutch",                  flag: "🇳🇱", hl: "nl" },
  { code: "en",      label: "English",                flag: "🇬🇧", hl: "en-US" },
  { code: "fr",      label: "French",                 flag: "🇫🇷", hl: "fr" },
  { code: "de",      label: "German",                 flag: "🇩🇪", hl: "de" },
  { code: "he",      label: "Hebrew",                 flag: "🇮🇱", hl: "he" },
  { code: "hi",      label: "Hindi",                  flag: "🇮🇳", hl: "hi" },
  { code: "id",      label: "Indonesian",             flag: "🇮🇩", hl: "id" },
  { code: "it",      label: "Italian",                flag: "🇮🇹", hl: "it" },
  { code: "ja",      label: "Japanese",               flag: "🇯🇵", hl: "ja" },
  { code: "ko",      label: "Korean",                 flag: "🇰🇷", hl: "ko" },
  { code: "pl",      label: "Polish",                 flag: "🇵🇱", hl: "pl" },
  { code: "pt-BR",   label: "Portuguese (Brazil)",    flag: "🇧🇷", hl: "pt-BR" },
  { code: "pt-PT",   label: "Portuguese (Portugal)",  flag: "🇵🇹", hl: "pt-PT" },
  { code: "ru",      label: "Russian",                flag: "🇷🇺", hl: "ru" },
  { code: "es",      label: "Spanish",                flag: "🇪🇸", hl: "es" },
  { code: "es-419",  label: "Spanish (Latin America)",flag: "🇲🇽", hl: "es-419" },
  { code: "th",      label: "Thai",                   flag: "🇹🇭", hl: "th" },
  { code: "tr",      label: "Turkish",                flag: "🇹🇷", hl: "tr" },
  { code: "uk",      label: "Ukrainian",              flag: "🇺🇦", hl: "uk" },
  { code: "vi",      label: "Vietnamese",             flag: "🇻🇳", hl: "vi" },
];

export const LANGUAGE_BY_CODE: Record<string, NewsLanguage> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l])
);

/** Empty string = "Auto / country's default". */
export const LANGUAGE_AUTO = "";

export const DEFAULT_COUNTRY = "US";
export const DEFAULT_LANGUAGE = LANGUAGE_AUTO;
export const DEFAULT_REFRESH_INTERVAL_MIN = 15;
export const DEFAULT_HEADLINE_COUNT = 10;
export const MIN_HEADLINE_COUNT = 1;
export const MAX_HEADLINE_COUNT = 20;
export const MIN_REFRESH_INTERVAL_MIN = 1;
export const MAX_REFRESH_INTERVAL_MIN = 120;
