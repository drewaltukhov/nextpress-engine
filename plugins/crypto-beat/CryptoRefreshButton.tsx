"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshCryptoPrices } from "@/app/admin/(shell)/plugins/crypto-beat/actions";

export function CryptoRefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          const res = await refreshCryptoPrices();
          if (!res.ok) toast.error(res.error);
        })
      }
      disabled={pending}
      className="text-slate-400 hover:text-brand-green disabled:opacity-50 transition-colors p-1 rounded"
      aria-label="Refresh prices"
      title="Refresh prices"
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} strokeWidth={2.5} />
    </button>
  );
}
