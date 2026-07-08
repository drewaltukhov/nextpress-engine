"use client";

import { useDisplayFormat } from "@core/components/AdminShellContext";
import {
  formatDate,
  formatDateTime,
  formatTime,
  parseSqliteUtc,
} from "@core/datetime";

interface BaseProps {
  /**
   * SQLite-shaped (`"YYYY-MM-DD HH:MM:SS"`), ISO-8601, or any string
   * `parseSqliteUtc` can handle. Pass through `null`/`undefined` to render
   * a fallback (default em-dash).
   */
  iso: string | null | undefined;
  /** Rendered when `iso` is null/undefined or fails to parse (default `—`). */
  fallback?: React.ReactNode;
  className?: string;
  /** Optional title attribute override. Defaults to a full date+time tooltip. */
  title?: string;
}

interface FormattedDateProps extends BaseProps {
  /** Show a full date+time tooltip on hover (default true). */
  withTooltip?: boolean;
}

/**
 * Render a SQLite/ISO timestamp using the site's configured `site.date_format`
 * + `site.timezone`. Locale is pinned per-token so server (Node) and client
 * (any browser) emit identical strings — no hydration mismatch. Hover shows
 * a date+time tooltip by default.
 */
export function FormattedDate({
  iso,
  fallback = "—",
  className,
  title,
  withTooltip = true,
}: FormattedDateProps) {
  const { dateFormat, timeFormat, timezone } = useDisplayFormat();
  if (!iso) return <span className={className}>{fallback}</span>;
  const date = parseSqliteUtc(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;
  const text = formatDate(date, dateFormat, timezone);
  const tooltip = title ?? (withTooltip ? formatDateTime(date, dateFormat, timeFormat, timezone) : undefined);
  return (
    <span className={className} title={tooltip}>
      {text}
    </span>
  );
}

/**
 * Render a SQLite/ISO timestamp as combined date + time using the site's
 * configured formats and timezone. Locale-pinned per token.
 */
export function FormattedDateTime({
  iso,
  fallback = "—",
  className,
  title,
}: BaseProps) {
  const { dateFormat, timeFormat, timezone } = useDisplayFormat();
  if (!iso) return <span className={className}>{fallback}</span>;
  const date = parseSqliteUtc(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;
  return (
    <span className={className} title={title}>
      {formatDateTime(date, dateFormat, timeFormat, timezone)}
    </span>
  );
}

/**
 * Render the time-only portion of a SQLite/ISO timestamp using the site's
 * configured `site.time_format` + timezone. Locale-pinned.
 */
export function FormattedTime({
  iso,
  fallback = "—",
  className,
  title,
  showSeconds = false,
}: BaseProps & { showSeconds?: boolean }) {
  const { timeFormat, timezone } = useDisplayFormat();
  if (!iso) return <span className={className}>{fallback}</span>;
  const date = parseSqliteUtc(iso);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;
  return (
    <span className={className} title={title}>
      {formatTime(date, timeFormat, timezone, showSeconds)}
    </span>
  );
}
