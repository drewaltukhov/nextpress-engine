"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { savePreferences, type CryptoBeatSettings } from "./actions";
import type { CurrencyCode } from "@plugins/crypto-beat/types";

interface Props {
  initial: CryptoBeatSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  // API key: never reveal the existing one. Empty = leave unchanged.
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [editingKey, setEditingKey] = useState(!initial.apiKeyConfigured);
  const [currency, setCurrency] = useState<CurrencyCode>(initial.currency);
  const [refreshMin, setRefreshMin] = useState(initial.refreshIntervalMin);
  const [savePending, startSaveTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startSaveTransition(async () => {
      const result = await savePreferences({
        apiKey: editingKey ? apiKey : null,
        currency,
        refreshIntervalMin: refreshMin,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Crypto Beat settings saved");
      if (editingKey && apiKey.length > 0) {
        setEditingKey(false);
        setApiKey("");
        setShowKey(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── API key card ─────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">CoinGecko API key</h3>
          <p className="text-xs text-slate-500 mb-4">
            Demo keys (free) start with <code className="text-[11px]">CG-</code>. Get one at{" "}
            <a
              href="https://www.coingecko.com/en/developers/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-green hover:underline"
            >
              coingecko.com
            </a>.
          </p>

          {!editingKey ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <KeyRound className="size-4 text-brand-green" />
                <span className="font-mono">••••••••••••</span>
                <span className="text-xs text-slate-400">configured</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingKey(true)}
                className="text-xs font-medium text-brand-green hover:underline"
              >
                Replace
              </button>
            </div>
          ) : (
            <div>
              <label className={labelCls}>API key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="CG-..."
                  autoComplete="off"
                  className={`${inputCls} pr-10 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showKey ? "Hide" : "Show"}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {initial.apiKeyConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingKey(false);
                    setApiKey("");
                    setShowKey(false);
                  }}
                  className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Preferences card ─────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Preferences</h3>

          <div className="mb-4">
            <label className={labelCls}>Display currency</label>
            <Select
              value={currency}
              onValueChange={(v) => {
                if (v === "usd" || v === "eur" || v === "gbp") setCurrency(v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{currency.toUpperCase()}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD ($)</SelectItem>
                <SelectItem value="eur">EUR (€)</SelectItem>
                <SelectItem value="gbp">GBP (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelCls}>Refresh interval (minutes)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={refreshMin}
              onChange={(e) => setRefreshMin(Number(e.target.value) || 5)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-400">
              How often the dashboard widget refetches prices. Demo keys are rate-limited, so 5+ minutes is recommended.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={savePending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savePending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
