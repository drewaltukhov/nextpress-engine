"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLogSettings, purgeLogs, type LogSettings } from "./actions";

interface Props {
  initial: LogSettings;
}

const RETENTION_OPTIONS = [
  { value: "1", label: "1 month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
];

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const router = useRouter();
  const [months, setMonths] = useState(String(initial.retentionMonths));
  const [savePending, startSaveTransition] = useTransition();

  const [purgePending, startPurgeTransition] = useTransition();
  const [showPurge, setShowPurge] = useState(false);
  const [purgePassword, setPurgePassword] = useState("");
  const [purgeError, setPurgeError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startSaveTransition(async () => {
      const result = await saveLogSettings({ retentionMonths: Number(months) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Log settings saved");
    });
  }

  function handlePurge() {
    if (!purgePassword) return;
    setPurgeError(null);
    startPurgeTransition(async () => {
      const fd = new FormData();
      fd.set("password", purgePassword);
      const result = await purgeLogs(fd);
      if (!result.ok) {
        setPurgeError(result.error);
        return;
      }
      toast.success("All logs have been purged");
      setShowPurge(false);
      setPurgePassword("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Retention ───────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Retention</h3>
          <form onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Store logs for the last
              </label>
              <Select value={months} onValueChange={(v) => { if (v) setMonths(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {RETENTION_OPTIONS.find((o) => o.value === months)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-slate-400">
                Older logs are automatically cleaned up.
              </p>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={savePending}
                className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savePending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Danger zone ─────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Danger Zone</h3>
          <p className="text-xs text-slate-500 mb-4">
            Permanently delete all logs. This cannot be undone.
          </p>

          {!showPurge ? (
            <button
              type="button"
              onClick={() => setShowPurge(true)}
              className="h-10 px-6 rounded-lg border border-red-200 text-red-600 font-medium text-sm transition-colors hover:bg-red-50"
            >
              Purge all logs
            </button>
          ) : (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>
                  This will <strong>permanently delete all logs</strong>.
                  Enter your password to confirm.
                </span>
              </div>

              <input
                type="password"
                value={purgePassword}
                onChange={(e) => { setPurgePassword(e.target.value); setPurgeError(null); }}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
              />

              {purgeError && (
                <p className="text-sm text-red-700">{purgeError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePurge}
                  disabled={purgePending || !purgePassword}
                  className="h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {purgePending ? "Purging..." : "Confirm purge"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPurge(false); setPurgePassword(""); setPurgeError(null); }}
                  disabled={purgePending}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
