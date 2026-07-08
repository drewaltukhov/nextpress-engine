import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import type { DbClient } from "@core/db/client";
import { db as dbInstance } from "@core/db/instance";
import { defineSettings, getSetting } from "@core-plugins/settings/registry";
import { getCachedOrFreshPrices } from "./service";
import { CryptoBeatWidget } from "./CryptoBeatWidget";
import { CryptoRefreshButton } from "./CryptoRefreshButton";
import type { CryptoAsset, CryptoBeatWidgetData, CurrencyCode } from "./types";
import { MAX_ASSETS } from "./types";
import "@core-plugins/themes/render-types";

// The theme-block registration lives in `./theme-blocks.tsx`. It's
// side-effect-imported by `src/generated/plugin-blocks.ts` (which
// both server and client bundles include) so the cross-surface block
// registry is populated identically on both sides. Keeping it out of
// this file lets `index.tsx` continue to depend on server-only
// modules (db, settings) without breaking the client bundle.

function CryptoBeatCard({ data }: { data: CryptoBeatWidgetData }) {
  return (
    <CryptoBeatWidget
      rows={data.rows}
      currency={data.currency}
      apiKeyConfigured={data.apiKeyConfigured}
    />
  );
}

async function fetchPrices(db: DbClient): Promise<CryptoBeatWidgetData> {
  const [rows, currency, apiKey] = await Promise.all([
    getCachedOrFreshPrices(db),
    getSetting<CurrencyCode>(db, "crypto-beat.currency"),
    getSetting<string>(db, "crypto-beat.api_key", process.env.AUTH_SECRET),
  ]);
  return {
    rows,
    currency: currency ?? "usd",
    apiKeyConfigured: typeof apiKey === "string" && apiKey.trim().length > 0,
  };
}

const assetSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string(),
});

export default function register(api: PluginAPI): void {
  api.dashboard.registerWidget<CryptoBeatWidgetData>({
    slug: "crypto-beat.prices",
    title: "Crypto Beat",
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3 },
    maxSize: { w: 12, h: 12 },
    Component: CryptoBeatCard,
    HeaderActions: CryptoRefreshButton,
    fetch: async ({ db }) => fetchPrices(db),
  });

  api.hooks.filter("theme.metadata", async ({ value }) => ({
    ...value,
    "crypto-beat": await fetchPrices(dbInstance()),
  }));

  defineSettings([
    {
      key: "crypto-beat.api_key",
      group: "Crypto Beat",
      label: "CoinGecko API key",
      description: "Demo or Pro key. Demo keys start with CG-.",
      schema: z.string().max(200),
      defaultValue: "",
      scope: "private",
      encrypted: true,
    },
    {
      key: "crypto-beat.assets",
      group: "Crypto Beat",
      label: "Tracked assets",
      schema: z.array(assetSchema).max(MAX_ASSETS),
      defaultValue: [] as CryptoAsset[],
      scope: "private",
    },
    {
      key: "crypto-beat.currency",
      group: "Crypto Beat",
      label: "Display currency",
      schema: z.enum(["usd", "eur", "gbp"]),
      defaultValue: "usd",
      scope: "private",
    },
    {
      key: "crypto-beat.refresh_interval_min",
      group: "Crypto Beat",
      label: "Refresh interval (minutes)",
      schema: z.number().int().min(1).max(60),
      defaultValue: 5,
      scope: "private",
    },
    {
      key: "crypto-beat.cached_data",
      group: "Crypto Beat",
      label: "Cached price data",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "crypto-beat.last_fetched",
      group: "Crypto Beat",
      label: "Last fetched timestamp",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
  ]);
}
