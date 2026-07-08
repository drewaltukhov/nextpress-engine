import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { registerCache, getCached, invalidateCache } from "@core/cache/plugin-cache";
import type { CryptoAsset, CryptoPriceRow, CryptoSearchResult, CurrencyCode } from "./types";

const CG_BASE = "https://api.coingecko.com/api/v3";
const CACHE_KEY = "crypto-beat";

let cacheRegistered = false;

function authHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  // Demo keys (CG-...) and pro keys use different headers.
  if (apiKey) {
    if (apiKey.startsWith("CG-")) headers["x-cg-demo-api-key"] = apiKey;
    else headers["x-cg-pro-api-key"] = apiKey;
  }
  return headers;
}

/** CoinGecko coin search — used by the Assets tab autocomplete. */
export async function searchCoins(query: string, apiKey: string | null): Promise<CryptoSearchResult[]> {
  const url = `${CG_BASE}/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) return [];
  const data = await res.json();
  const coins = Array.isArray(data?.coins) ? data.coins : [];
  return coins.slice(0, 10).map((c: Record<string, unknown>) => ({
    id: String(c.id ?? ""),
    symbol: String(c.symbol ?? "").toUpperCase(),
    name: String(c.name ?? ""),
    image: String(c.thumb ?? c.large ?? ""),
  })).filter((c: CryptoSearchResult) => c.id.length > 0);
}

/**
 * Bulk price fetch for the configured asset list. Returns rows in the same
 * order as `assets` so the widget renders predictably.
 */
async function fetchPrices(
  assets: CryptoAsset[],
  currency: CurrencyCode,
  apiKey: string | null
): Promise<CryptoPriceRow[]> {
  if (assets.length === 0) return [];
  const ids = assets.map((a) => a.id).join(",");
  const url =
    `${CG_BASE}/simple/price?ids=${encodeURIComponent(ids)}` +
    `&vs_currencies=${currency}&include_24hr_change=true`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) {
    return assets.map((a) => ({ ...a, price: null, change24h: null }));
  }
  const data = (await res.json()) as Record<string, Record<string, number>>;
  return assets.map((a) => {
    const row = data[a.id];
    if (!row) return { ...a, price: null, change24h: null };
    return {
      ...a,
      price: typeof row[currency] === "number" ? row[currency] : null,
      change24h: typeof row[`${currency}_24h_change`] === "number" ? row[`${currency}_24h_change`] : null,
    };
  });
}

/** Read the asset list from settings, tolerating bad JSON or schema drift. */
async function readAssets(db: DbClient): Promise<CryptoAsset[]> {
  const raw = await getSetting<unknown>(db, "crypto-beat.assets");
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => typeof it === "object" && it !== null)
    .map((it) => ({
      id: String(it.id ?? ""),
      symbol: String(it.symbol ?? ""),
      name: String(it.name ?? ""),
      image: String(it.image ?? ""),
    }))
    .filter((a) => a.id.length > 0);
}

function ensureCacheRegistered(db: DbClient, ttlMinutes: number): void {
  if (cacheRegistered) return;
  cacheRegistered = true;
  registerCache<CryptoPriceRow[]>({
    key: CACHE_KEY,
    ttlMs: Math.max(1, ttlMinutes) * 60 * 1000,
    settingsDataKey: "crypto-beat.cached_data",
    settingsTimestampKey: "crypto-beat.last_fetched",
    fetcher: async () => {
      const [assets, currency, apiKey] = await Promise.all([
        readAssets(db),
        getSetting<CurrencyCode>(db, "crypto-beat.currency"),
        getSetting<string>(db, "crypto-beat.api_key", process.env.AUTH_SECRET),
      ]);
      const cur = currency ?? "usd";
      return fetchPrices(assets, cur, apiKey ?? null);
    },
  });
}

/**
 * Public entry — returns SWR-cached price rows. Empty array if no assets
 * configured. Null entries inside rows when CoinGecko didn't return data
 * for that id.
 */
export async function getCachedOrFreshPrices(db: DbClient): Promise<CryptoPriceRow[]> {
  const ttl = (await getSetting<number>(db, "crypto-beat.refresh_interval_min")) ?? 5;
  ensureCacheRegistered(db, ttl);
  const rows = await getCached<CryptoPriceRow[]>(CACHE_KEY, db);
  return rows ?? [];
}

/** Clear the cache — called from settings save server actions. */
export function clearCryptoBeatCache(): void {
  invalidateCache(CACHE_KEY);
}
