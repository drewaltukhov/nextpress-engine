export interface CryptoAsset {
  /** CoinGecko coin id, e.g. "bitcoin" */
  id: string;
  /** Trading symbol, e.g. "BTC" */
  symbol: string;
  /** Display name, e.g. "Bitcoin" */
  name: string;
  /** Thumbnail URL from CoinGecko search */
  image: string;
}

export interface CryptoPriceRow extends CryptoAsset {
  /** Current price in the configured currency */
  price: number | null;
  /** 24h percent change (e.g. 1.23 = +1.23%) */
  change24h: number | null;
}

export type CurrencyCode = "usd" | "eur" | "gbp";

export interface CryptoSearchResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

export const MAX_ASSETS = 10;

/** Shape produced by Crypto Beat's data fetcher; consumed by both
 *  the dashboard widget Component and the theme block's render. The
 *  same shape lands under `puck.metadata.plugins["crypto-beat"]` via
 *  the `theme.metadata` filter handler. */
export interface CryptoBeatWidgetData {
  rows: CryptoPriceRow[];
  currency: CurrencyCode;
  apiKeyConfigured: boolean;
}
