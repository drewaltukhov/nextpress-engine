import Link from "next/link";
import type { NewsHeadline } from "./types";
import { COUNTRY_BY_CODE, DEFAULT_COUNTRY } from "./types";

interface Props {
  headlines: NewsHeadline[];
  country: string;
  showDescription: boolean;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function EmptyState({ country }: { country: string }) {
  const c = COUNTRY_BY_CODE[country] ?? COUNTRY_BY_CODE[DEFAULT_COUNTRY];
  return (
    <div className="flex flex-col items-center justify-center text-center py-6 px-4">
      <p className="text-sm font-medium text-slate-700">No headlines</p>
      <p className="mt-1 text-xs text-slate-500 max-w-xs">
        Couldn&apos;t load Google News for {c.flag} {c.label}. Try the refresh icon, or pick a different country in settings.
      </p>
      <Link
        href="/admin/plugins/google-news?tab=news"
        className="mt-3 inline-flex items-center h-8 px-3 rounded-lg bg-brand-green text-white text-xs font-medium hover:bg-brand-green/90"
      >
        Open settings
      </Link>
    </div>
  );
}

export function GoogleNewsWidget({ headlines, country, showDescription }: Props) {
  if (headlines.length === 0) return <EmptyState country={country} />;

  return (
    <div className="flex flex-col">
      {headlines.map((h) => (
        <a
          key={h.id || h.link}
          href={h.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 -mx-1 px-1 rounded transition-colors"
        >
          <div className="text-sm font-medium text-slate-900 leading-snug line-clamp-2">
            {h.title}
          </div>
          {showDescription && (h.source || h.publishedAt) && (
            <div className="mt-0.5 text-[11px] text-slate-400 truncate">
              {h.source}
              {h.source && h.publishedAt ? " · " : ""}
              {timeAgo(h.publishedAt)}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
