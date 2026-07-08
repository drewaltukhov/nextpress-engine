/**
 * Datetime helpers for the SQLite/libSQL DB.
 *
 * SQLite's `CURRENT_TIMESTAMP` returns UTC strings shaped like
 * `"2026-05-02 16:37:06"` — no `T`, no `Z` suffix. JavaScript's `new Date()`
 * parses that ambiguous form as *local* time, so a UTC event at 16:37 read
 * from the DB shows up as local 16:37, which is wrong by the user's TZ
 * offset. The bug surfaces as relative-time labels being shifted by hours.
 *
 * `parseSqliteUtc()` normalizes the format and forces UTC interpretation.
 * All client/server code that renders DB timestamps should go through here.
 *
 * The display formatters (`formatDate`/`formatTime`/`formatDateTime`) pin
 * an explicit locale per token so server (Node) and client (any browser)
 * emit identical text regardless of host locale — without that pin, a
 * Russian-locale browser hydrating against an en-US Node render triggers
 * a React hydration mismatch.
 */

const SQLITE_UTC_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Parse a SQLite/libSQL timestamp string as UTC. Accepts both the bare
 * SQLite shape (`"YYYY-MM-DD HH:MM:SS"`) and ISO-8601 strings that already
 * carry a `Z` or numeric offset — those pass straight through.
 */
export function parseSqliteUtc(s: string): Date {
  if (SQLITE_UTC_RE.test(s)) {
    return new Date(`${s.replace(" ", "T")}Z`);
  }
  return new Date(s);
}

export type DateFormat = "yyyy-MM-dd" | "MMM d, yyyy" | "d MMM yyyy" | "MM/dd/yyyy" | "dd/MM/yyyy";
export type TimeFormat = "12h" | "24h";

export const DEFAULT_DATE_FORMAT: DateFormat = "MMM d, yyyy";
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";
export const DEFAULT_TIMEZONE = "UTC";

/**
 * Render a Date using one of the supported `site.date_format` tokens.
 * Each token is mapped to a (locale, options) pair that produces the
 * intended shape — the locale is pinned so output is byte-identical on
 * Node and in any browser (no hydration mismatch).
 */
export function formatDate(date: Date, format: DateFormat, timezone: string): string {
  switch (format) {
    case "yyyy-MM-dd":
      // sv-SE formats as "2026-05-02"
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(date);
    case "MMM d, yyyy":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, year: "numeric", month: "short", day: "numeric",
      }).format(date);
    case "d MMM yyyy":
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone, year: "numeric", month: "short", day: "numeric",
      }).format(date);
    case "MM/dd/yyyy":
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(date);
    case "dd/MM/yyyy":
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(date);
  }
}

/**
 * Render the time portion of a Date in 12h or 24h, locale-pinned.
 */
export function formatTime(
  date: Date,
  format: TimeFormat,
  timezone: string,
  showSeconds = false,
): string {
  return new Intl.DateTimeFormat(format === "12h" ? "en-US" : "en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: format === "12h",
  }).format(date);
}

/**
 * Combined date + time, separated by " · ". Convenience for tooltip
 * titles and "uploaded at" displays.
 */
export function formatDateTime(
  date: Date,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
  timezone: string,
  showSeconds = false,
): string {
  return `${formatDate(date, dateFormat, timezone)} · ${formatTime(date, timeFormat, timezone, showSeconds)}`;
}

/**
 * Render the long English weekday in the given timezone. Pinned to en-US.
 */
export function formatWeekday(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date);
}

/**
 * Relative-time label: "Just now", "5m ago", "3h ago", "Yesterday", "4d ago".
 * Beyond 30 days, falls back to a locale-pinned date string. Always parses
 * the input as UTC via `parseSqliteUtc` so SQLite-shaped timestamps render
 * correctly regardless of the host TZ.
 */
export function timeAgo(s: string): string {
  const date = parseSqliteUtc(s);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(date, DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE);
}
