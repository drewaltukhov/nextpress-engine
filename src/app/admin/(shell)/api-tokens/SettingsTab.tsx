"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveApiTokensSettings, type ApiTokensSettings } from "./actions";

interface Props {
  initial: ApiTokensSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const [defaultTtlDays, setDefaultTtlDays] = useState(String(initial.defaultTtlDays));
  const [defaultRateLimit, setDefaultRateLimit] = useState(String(initial.defaultRateLimit));
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ttl = Number(defaultTtlDays);
    const rate = Number(defaultRateLimit);
    if (!Number.isInteger(ttl) || ttl < 0) {
      toast.error("Default lifetime must be a whole number of days (0 = never)");
      return;
    }
    if (!Number.isInteger(rate) || rate < 1) {
      toast.error("Default rate limit must be at least 1");
      return;
    }
    startTransition(async () => {
      const result = await saveApiTokensSettings({
        defaultTtlDays: ttl,
        defaultRateLimit: rate,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("API token settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Default lifetime</h3>
        <p className="text-xs text-slate-500 mb-4">
          How long a freshly-generated token stays valid. Use <strong>0</strong> for tokens
          that never expire.
        </p>
        <label htmlFor="api-ttl" className="block text-sm font-medium text-slate-700 mb-1.5">
          Days
        </label>
        <input
          id="api-ttl"
          type="number"
          min={0}
          max={3650}
          step={1}
          value={defaultTtlDays}
          onChange={(e) => setDefaultTtlDays(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Default rate limit</h3>
        <p className="text-xs text-slate-500 mb-4">
          Per-token requests per minute. Tokens can override this individually in a future
          release; for now everyone shares this default.
        </p>
        <label htmlFor="api-rate" className="block text-sm font-medium text-slate-700 mb-1.5">
          Requests / minute
        </label>
        <input
          id="api-rate"
          type="number"
          min={1}
          max={10000}
          step={1}
          value={defaultRateLimit}
          onChange={(e) => setDefaultRateLimit(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="lg:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
