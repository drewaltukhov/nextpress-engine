"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import {
  searchCoins as searchCoinsService,
  clearCryptoBeatCache,
} from "@plugins/crypto-beat/service";
import {
  type CryptoAsset,
  type CryptoSearchResult,
  type CurrencyCode,
  MAX_ASSETS,
} from "@plugins/crypto-beat/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface CryptoBeatSettings {
  apiKeyConfigured: boolean;
  assets: CryptoAsset[];
  currency: CurrencyCode;
  refreshIntervalMin: number;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false as const, error: "Only administrators can change Crypto Beat settings" };
  }
  return { ok: true as const, session };
}

// ---------------------------------------------------------------------------
// Read settings (server-side, called from page.tsx)
// ---------------------------------------------------------------------------

export async function getCryptoBeatSettings(): Promise<CryptoBeatSettings> {
  const secret = process.env.AUTH_SECRET;
  const [apiKey, rawAssets, currency, ttl] = await Promise.all([
    getSetting<string>(db(), "crypto-beat.api_key", secret),
    getSetting<unknown>(db(), "crypto-beat.assets"),
    getSetting<CurrencyCode>(db(), "crypto-beat.currency"),
    getSetting<number>(db(), "crypto-beat.refresh_interval_min"),
  ]);

  const assets: CryptoAsset[] = Array.isArray(rawAssets)
    ? (rawAssets as unknown[])
        .filter((it): it is Record<string, unknown> => typeof it === "object" && it !== null)
        .map((it) => ({
          id: String(it.id ?? ""),
          symbol: String(it.symbol ?? ""),
          name: String(it.name ?? ""),
          image: String(it.image ?? ""),
        }))
        .filter((a) => a.id.length > 0)
    : [];

  return {
    apiKeyConfigured: typeof apiKey === "string" && apiKey.trim().length > 0,
    assets,
    currency: currency ?? "usd",
    refreshIntervalMin: ttl ?? 5,
  };
}

// ---------------------------------------------------------------------------
// Save assets list
// ---------------------------------------------------------------------------

export async function saveAssets(assets: CryptoAsset[]): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  if (!Array.isArray(assets)) return { ok: false, error: "Invalid assets payload" };
  if (assets.length > MAX_ASSETS) {
    return { ok: false, error: `Maximum ${MAX_ASSETS} assets allowed` };
  }
  const seen = new Set<string>();
  const cleaned: CryptoAsset[] = [];
  for (const a of assets) {
    if (!a || typeof a !== "object") continue;
    const id = String((a as CryptoAsset).id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    cleaned.push({
      id,
      symbol: String((a as CryptoAsset).symbol ?? "").slice(0, 20),
      name: String((a as CryptoAsset).name ?? "").slice(0, 100),
      image: String((a as CryptoAsset).image ?? "").slice(0, 500),
    });
  }

  const actorId = await resolveUserId(db(), guard.session.user);
  try {
    await setSetting(db(), "crypto-beat.assets", cleaned, { updatedBy: actorId });
    clearCryptoBeatCache();
    await setSetting(db(), "crypto-beat.cached_data", "", { updatedBy: actorId });
    await setSetting(db(), "crypto-beat.last_fetched", "", { updatedBy: actorId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "crypto-beat",
      diff: { assets: cleaned.map((a) => a.id) },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/crypto-beat");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save preferences (API key, currency, refresh interval)
// ---------------------------------------------------------------------------

export interface SavePreferencesInput {
  apiKey: string | null; // null = leave unchanged; "" = clear
  currency: CurrencyCode;
  refreshIntervalMin: number;
}

export async function savePreferences(input: SavePreferencesInput): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  if (!["usd", "eur", "gbp"].includes(input.currency)) {
    return { ok: false, error: "Invalid currency" };
  }
  if (
    !Number.isFinite(input.refreshIntervalMin) ||
    input.refreshIntervalMin < 1 ||
    input.refreshIntervalMin > 60
  ) {
    return { ok: false, error: "Refresh interval must be between 1 and 60 minutes" };
  }

  const actorId = await resolveUserId(db(), guard.session.user);
  const secret = process.env.AUTH_SECRET;
  const opts = { updatedBy: actorId, secret };
  try {
    if (input.apiKey !== null) {
      await setSetting(db(), "crypto-beat.api_key", input.apiKey.trim(), opts);
    }
    await setSetting(db(), "crypto-beat.currency", input.currency, opts);
    await setSetting(
      db(),
      "crypto-beat.refresh_interval_min",
      Math.round(input.refreshIntervalMin),
      opts
    );
    clearCryptoBeatCache();
    await setSetting(db(), "crypto-beat.cached_data", "", opts);
    await setSetting(db(), "crypto-beat.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "crypto-beat",
      diff: {
        api_key: input.apiKey !== null ? "(updated)" : "(unchanged)",
        currency: input.currency,
        refresh_interval_min: input.refreshIntervalMin,
      },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/crypto-beat");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manual price refresh (dashboard widget refresh button)
// ---------------------------------------------------------------------------

export async function refreshCryptoPrices(): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const actorId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: actorId };

  // Bust both layers: in-memory map plus the DB-persisted snapshot so the
  // next render does a fresh CoinGecko fetch instead of returning stale.
  clearCryptoBeatCache();
  try {
    await setSetting(db(), "crypto-beat.cached_data", "", opts);
    await setSetting(db(), "crypto-beat.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cache clear failed" };
  }

  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CoinGecko coin search (autocomplete in the Assets tab)
// ---------------------------------------------------------------------------

export async function searchCoins(query: string): Promise<CryptoSearchResult[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!query.trim()) return [];
  const apiKey = await getSetting<string>(db(), "crypto-beat.api_key", process.env.AUTH_SECRET);
  return searchCoinsService(query.trim(), apiKey ?? null);
}
