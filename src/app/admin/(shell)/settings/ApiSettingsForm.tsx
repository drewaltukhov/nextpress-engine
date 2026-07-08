"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { saveApiSettings, type ApiSettings } from "./api-actions";

interface Props {
  initial: ApiSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function ApiSettingsForm({ initial }: Props) {
  const [tokenTtl, setTokenTtl] = useState(initial.tokenDefaultTtlDays);
  const [cors, setCors] = useState(initial.corsAllowedOrigins);
  const [rateLimit, setRateLimit] = useState(initial.rateLimitPerMinute);
  const [logIntrospection, setLogIntrospection] = useState(initial.logTokenIntrospection);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveApiSettings({
        tokenDefaultTtlDays: tokenTtl,
        corsAllowedOrigins: cors,
        rateLimitPerMinute: rateLimit,
        logTokenIntrospection: logIntrospection,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("API settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Tokens & Rate Limiting ──────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Tokens & Rate Limiting</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="api-ttl" className={labelCls}>Default token lifetime (days)</label>
              <input
                id="api-ttl"
                type="number"
                min={0}
                max={3650}
                value={tokenTtl}
                onChange={(e) => setTokenTtl(Number(e.target.value))}
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-slate-400">0 = tokens never expire</p>
            </div>
            <div>
              <label htmlFor="api-rate" className={labelCls}>Rate limit (requests / minute)</label>
              <input
                id="api-rate"
                type="number"
                min={1}
                max={10000}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-slate-400">Per-token override beats this default</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Log token introspection</div>
                <div className="text-xs text-slate-500">
                  Audit-log every <code>/api/v1/me</code> call.
                </div>
              </div>
              <Switch checked={logIntrospection} onCheckedChange={setLogIntrospection} />
            </div>
          </div>
        </div>

        {/* ── CORS ────────────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Cross-Origin (CORS)</h3>
          <div>
            <label htmlFor="api-cors" className={labelCls}>Allowed origins</label>
            <textarea
              id="api-cors"
              rows={8}
              placeholder={"https://example.com\nhttps://app.example.com"}
              value={cors}
              onChange={(e) => setCors(e.target.value)}
              className={`${inputCls} font-mono text-sm`}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              One origin per line. Empty = same-origin only.
            </p>
          </div>
        </div>

      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
