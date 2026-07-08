"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveSecurityKnobs, type SecurityKnobs } from "./actions";

interface Props {
  initial: SecurityKnobs;
}

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lockoutThreshold, setLockoutThreshold] = useState(initial.lockoutThreshold);
  const [lockoutWindow, setLockoutWindow] = useState(initial.lockoutWindowMinutes);
  const [lockoutDuration, setLockoutDuration] = useState(initial.lockoutDurationMinutes);
  const [sessionMaxAge, setSessionMaxAge] = useState(initial.sessionMaxAgeDays);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveSecurityKnobs({
        lockoutThreshold,
        lockoutWindowMinutes: lockoutWindow,
        lockoutDurationMinutes: lockoutDuration,
        sessionMaxAgeDays: sessionMaxAge,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Security settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Account lockout ─────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Account Lockout</h3>
          <p className="text-xs text-slate-500 mb-4">
            Temporarily lock accounts after too many failed login attempts.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Failed attempts before lock</label>
              <Select value={String(lockoutThreshold)} onValueChange={(v) => setLockoutThreshold(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} attempts</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Counting window</label>
              <Select value={String(lockoutWindow)} onValueChange={(v) => setLockoutWindow(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 30, 60].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Lock duration</label>
              <Select value={String(lockoutDuration)} onValueChange={(v) => setLockoutDuration(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 60, 120, 240, 480, 1440].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n < 60 ? `${n} minutes` : n === 60 ? "1 hour" : `${n / 60} hours`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Session lifetime ────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Session Lifetime</h3>
          <p className="text-xs text-slate-500 mb-4">
            How long users stay signed in before they need to log in again.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Keep users signed in for</label>
            <Select value={String(sessionMaxAge)} onValueChange={(v) => setSessionMaxAge(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 7, 14, 30, 60, 90, 180, 365].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? "1 day" : n < 30 ? `${n} days` : n === 30 ? "1 month" : n === 60 ? "2 months" : n === 90 ? "3 months" : n === 180 ? "6 months" : "1 year"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
