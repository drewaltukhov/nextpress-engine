"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshWeather } from "@/app/admin/(shell)/plugins/weather/actions";

export function WeatherRefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          const res = await refreshWeather();
          if (!res.ok) toast.error(res.error);
        })
      }
      disabled={pending}
      className="text-slate-400 hover:text-brand-green disabled:opacity-50 transition-colors p-1 rounded"
      aria-label="Refresh weather"
      title="Refresh weather"
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} strokeWidth={2.5} />
    </button>
  );
}
