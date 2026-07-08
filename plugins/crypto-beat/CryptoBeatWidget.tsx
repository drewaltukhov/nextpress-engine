import Link from "next/link";
import type { CryptoPriceRow, CurrencyCode } from "./types";

interface Props {
  rows: CryptoPriceRow[];
  currency: CurrencyCode;
  apiKeyConfigured: boolean;
  /** When false (theme/public surface), suppresses /admin/... links
   *  inside EmptyState — public visitors must not be sent to admin. */
  showAdminCTAs?: boolean;
}

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
};

function formatPrice(price: number | null, currency: CurrencyCode): string {
  if (price === null) return "—";
  const sym = CURRENCY_SYMBOL[currency] ?? "$";
  // Coins with sub-dollar price need more precision; large coins less.
  const fractionDigits = price >= 1000 ? 0 : price >= 1 ? 2 : 6;
  return `${sym}${price.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function formatChange(change: number | null): { text: string; cls: string } {
  if (change === null) return { text: "—", cls: "text-slate-400" };
  const rounded = Math.round(change * 100) / 100;
  const sign = rounded >= 0 ? "+" : "";
  const cls = rounded >= 0 ? "text-emerald-600" : "text-rose-600";
  return { text: `${sign}${rounded.toFixed(2)}%`, cls };
}

function EmptyState({ title, body, cta }: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-6 px-4">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-xs">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-3 inline-flex items-center h-8 px-3 rounded-lg bg-brand-green text-white text-xs font-medium hover:bg-brand-green/90"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function CryptoBeatWidget({ rows, currency, apiKeyConfigured, showAdminCTAs = true }: Props) {
  if (!apiKeyConfigured) {
    return (
      <EmptyState
        title="Add your CoinGecko API key"
        body="Crypto Beat needs a CoinGecko key to fetch prices. The free Demo plan works."
        cta={showAdminCTAs ? { href: "/admin/plugins/crypto-beat?tab=settings", label: "Open settings" } : undefined}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No assets yet"
        body="Pick up to 10 coins to track. Bitcoin and Ethereum are good starts."
        cta={showAdminCTAs ? { href: "/admin/plugins/crypto-beat?tab=assets", label: "Add assets" } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const change = formatChange(row.change24h);
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0"
          >
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
            ) : (
              <div className="size-5 rounded-full bg-slate-100 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 truncate">{row.name}</div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide">{row.symbol}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {formatPrice(row.price, currency)}
              </div>
              <div className={`text-[11px] tabular-nums ${change.cls}`}>{change.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
