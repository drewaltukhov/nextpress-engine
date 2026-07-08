"use client";

import { useEffect, useState } from "react";
import {
  formatDate,
  formatTime,
  formatWeekday,
  type DateFormat,
  type TimeFormat,
} from "@core/datetime";

export type { DateFormat, TimeFormat } from "@core/datetime";

interface Props {
  /** IANA timezone, e.g. "Europe/Moscow", "America/New_York", "UTC". */
  timezone: string;
  /** Token-style date format from `site.date_format`. */
  dateFormat: DateFormat;
  /** "12h" or "24h" from `site.time_format`. */
  timeFormat: TimeFormat;
  /** Show seconds in the clock (default true — without them the tick is invisible). */
  showSeconds?: boolean;
  className?: string;
}

export function LiveClock({ timezone, dateFormat, timeFormat, showSeconds = true, className }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const weekday = formatWeekday(now, timezone);
  const date = formatDate(now, dateFormat, timezone);
  const time = formatTime(now, timeFormat, timezone, showSeconds);

  return (
    <span className={className} suppressHydrationWarning>
      {weekday}, {date} · {time}
    </span>
  );
}
