"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Search, Trash2 } from "lucide-react";
import {
  saveAssets,
  searchCoins,
  type CryptoBeatSettings,
} from "./actions";
import { MAX_ASSETS, type CryptoAsset, type CryptoSearchResult } from "@plugins/crypto-beat/types";

interface Props {
  initial: CryptoBeatSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function AssetsTab({ initial }: Props) {
  const [assets, setAssets] = useState<CryptoAsset[]>(initial.assets);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CryptoSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchPending, startSearchTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const dirty = useRef(false);

  // Mark dirty on assets change after first render
  useEffect(() => {
    dirty.current = true;
  }, [assets]);

  function runSearch() {
    if (!query.trim()) return;
    startSearchTransition(async () => {
      const found = await searchCoins(query);
      setResults(found);
      setShowResults(true);
    });
  }

  function addAsset(c: CryptoSearchResult) {
    if (assets.length >= MAX_ASSETS) {
      toast.error(`Maximum ${MAX_ASSETS} assets`);
      return;
    }
    if (assets.some((a) => a.id === c.id)) {
      toast.info(`${c.name} is already in your list`);
      return;
    }
    setAssets((prev) => [...prev, { id: c.id, symbol: c.symbol, name: c.name, image: c.image }]);
    setShowResults(false);
    setQuery("");
    setResults([]);
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    setAssets((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleSave() {
    startSaveTransition(async () => {
      const result = await saveAssets(assets);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      dirty.current = false;
      toast.success("Assets saved");
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Add asset card ─────────────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Add an asset</h3>
        <p className="text-xs text-slate-500 mb-4">
          Search CoinGecko by name or symbol. Up to {MAX_ASSETS} assets total.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="e.g. Bitcoin, ETH, Solana"
            className={inputCls}
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searchPending || !query.trim()}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 inline-flex items-center gap-1.5"
          >
            <Search className="size-4" />
            {searchPending ? "..." : "Search"}
          </button>
        </div>
        {showResults && results.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden max-h-64 overflow-y-auto">
            {results.map((r) => {
              const already = assets.some((a) => a.id === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => addAsset(r)}
                  disabled={already}
                  className="w-full flex items-center gap-3 text-left px-4 py-2.5 hover:bg-brand-light-green/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" width={20} height={20} className="rounded-full" />
                  ) : (
                    <div className="size-5 rounded-full bg-slate-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                    <div className="text-xs text-slate-400 uppercase">{r.symbol}</div>
                  </div>
                  {already && <span className="text-xs text-slate-400">added</span>}
                </button>
              );
            })}
          </div>
        )}
        {showResults && results.length === 0 && !searchPending && (
          <p className="mt-3 text-sm text-slate-400">No coins match.</p>
        )}
        {!initial.apiKeyConfigured && (
          <p className="mt-3 text-xs text-amber-600">
            Add your CoinGecko API key in the Settings tab — search and prices won&apos;t work without it.
          </p>
        )}
      </div>

      {/* ── Tracked list card ──────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Tracked assets</h3>
          <span className="text-xs text-slate-400">
            {assets.length} / {MAX_ASSETS}
          </span>
        </div>

        {assets.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No assets yet. Search above to add one.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assets.map((a, idx) => (
              <li key={a.id} className="flex items-center gap-2 py-2">
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
                ) : (
                  <div className="size-5 rounded-full bg-slate-100 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{a.name}</div>
                  <div className="text-[11px] text-slate-400 uppercase">{a.symbol}</div>
                </div>
                <button
                  type="button"
                  onClick={() => move(a.id, -1)}
                  disabled={idx === 0}
                  className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(a.id, 1)}
                  disabled={idx === assets.length - 1}
                  className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAsset(a.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Save bar */}
      <div className="lg:col-span-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savePending ? "Saving..." : "Save assets"}
        </button>
      </div>
    </div>
  );
}
