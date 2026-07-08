"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { savePreferences, type GoogleNewsSettings } from "./actions";
import {
  DEFAULT_HEADLINE_COUNT,
  DEFAULT_REFRESH_INTERVAL_MIN,
  MAX_HEADLINE_COUNT,
  MAX_REFRESH_INTERVAL_MIN,
  MIN_HEADLINE_COUNT,
  MIN_REFRESH_INTERVAL_MIN,
} from "@plugins/google-news/types";

interface Props {
  initial: GoogleNewsSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const [refreshMin, setRefreshMin] = useState(initial.refreshIntervalMin);
  const [headlineCount, setHeadlineCount] = useState(initial.headlineCount);
  const [showDescription, setShowDescription] = useState(initial.showDescription);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await savePreferences({
        refreshIntervalMin: refreshMin,
        headlineCount,
        showDescription,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Google News settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Fetch behavior card ─────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Fetch behavior</h3>

          <div className="mb-4">
            <label className={labelCls}>Refresh interval (minutes)</label>
            <input
              type="number"
              min={MIN_REFRESH_INTERVAL_MIN}
              max={MAX_REFRESH_INTERVAL_MIN}
              value={refreshMin}
              onChange={(e) => setRefreshMin(Number(e.target.value) || DEFAULT_REFRESH_INTERVAL_MIN)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-400">
              How often the dashboard widget refetches headlines. Google&apos;s RSS feed has no quota,
              so anything from {MIN_REFRESH_INTERVAL_MIN} to {MAX_REFRESH_INTERVAL_MIN} minutes is fine.
            </p>
          </div>

          <div>
            <label className={labelCls}>Headlines to show</label>
            <input
              type="number"
              min={MIN_HEADLINE_COUNT}
              max={MAX_HEADLINE_COUNT}
              value={headlineCount}
              onChange={(e) => setHeadlineCount(Number(e.target.value) || DEFAULT_HEADLINE_COUNT)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-400">
              Between {MIN_HEADLINE_COUNT} and {MAX_HEADLINE_COUNT}.
            </p>
          </div>
        </div>

        {/* ── Appearance card ─────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Appearance</h3>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-700">Show brief description</div>
              <div className="text-xs text-slate-500">
                Adds a small subtitle under each headline with the source name and time
                (e.g. <span className="font-medium">Reuters · 2h ago</span>). Google News
                doesn&apos;t expose article snippets, so this is the best &ldquo;brief&rdquo; we can show.
              </div>
            </div>
            <Switch checked={showDescription} onCheckedChange={setShowDescription} />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
