"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refreshUpdateCheck } from "./actions";
import { parseSqliteUtc } from "@core/datetime";

interface Props {
  /** ISO timestamp from the cached UpdateCheckResult, or null if no check has run yet. */
  checkedAt: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - parseSqliteUtc(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / (60 * 24));
  return `${days}d ago`;
}

export function CheckedAtPill({ checkedAt }: Props) {
  const [pending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      await refreshUpdateCheck();
    });
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
      <span className="text-slate-500" suppressHydrationWarning>
        {checkedAt ? `Checked ${timeAgo(checkedAt)}` : "Not checked yet"}
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-brand-green font-semibold hover:underline disabled:opacity-50 disabled:no-underline"
        aria-label="Refresh version check"
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} strokeWidth={2.5} />
        {pending ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
