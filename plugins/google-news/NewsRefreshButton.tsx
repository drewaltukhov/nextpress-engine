"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshGoogleNews } from "@/app/admin/(shell)/plugins/google-news/actions";

export function NewsRefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          const res = await refreshGoogleNews();
          if (!res.ok) toast.error(res.error);
        })
      }
      disabled={pending}
      className="text-slate-400 hover:text-brand-green disabled:opacity-50 transition-colors p-1 rounded"
      aria-label="Refresh news"
      title="Refresh news"
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} strokeWidth={2.5} />
    </button>
  );
}
