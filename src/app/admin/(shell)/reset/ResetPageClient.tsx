"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmReset } from "./actions";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";

export function ResetPageClient() {
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  const canSubmit = acknowledged && confirmation === "RESET" && password.length > 0 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await confirmReset({ password, confirmation });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Site reset. Redirecting to setup wizard…");
      // Hand off to the cookie-clearing route handler — its
      // NextResponse.redirect attaches Set-Cookie reliably (unlike
      // cookies() from next/headers in a server action). It clears the
      // setup cookie + every Auth.js session variant, then 302s to
      // /admin/setup. Without this hop the proxy sees the still-present
      // stale JWT and ping-pongs to /admin/login forever.
      window.location.href = "/api/admin/reset/finish";
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-4xl tracking-tight text-brand-navy">Reset site</h1>
        <p className="mt-1 text-sm text-slate-500">
          Erases all users, settings, and your setup so the site goes back to a brand-new state.
          Handy while you&rsquo;re still experimenting before going live.
        </p>
      </div>

      {/* Big red warning */}
      <div className="rounded-xl border-2 border-red-200 bg-red-50/60 p-5 mb-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-red-900">This is destructive and not undoable.</h2>
            <ul className="text-sm text-red-900/90 list-disc ms-5 space-y-0.5">
              <li>All user accounts, role assignments, credentials, and active sessions are deleted. You&apos;ll be signed out and bounced to the setup wizard.</li>
              <li>Every uploaded media file is removed.</li>
              <li>Redirects, API tokens, and security IP lists are cleared.</li>
              <li>Audit log, system log, plugin-failure records, and failed-job entries are wiped.</li>
              <li>SMTP credentials and the core <code className="font-mono text-xs">site.*</code> settings are reset; seeded plugin defaults are preserved.</li>
              <li>Schema, role definitions, plugin registry, and reserved slugs stay put.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Backup suggestion */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 mb-6 flex items-center gap-3">
        <Download className="size-5 text-amber-700 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-amber-900">Take a backup first.</p>
          <p className="text-amber-800/80 mt-0.5">
            Restoring is much faster and fully reversible compared to rebuilding by hand.
          </p>
        </div>
        <Link
          href="/admin/backup"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors"
        >
          Open Backup
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <label className="flex items-start gap-2.5 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-300 text-red-600 focus:ring-red-500/30"
          />
          <span className="text-slate-900">
            I understand this wipes all users, media, redirects, API tokens, IP lists, logs, and
            wizard-set settings, signs me out, and is not reversible without restoring a backup.
          </span>
        </label>

        <div>
          <label htmlFor="reset-confirm" className={labelCls}>
            Type <span className="font-mono font-semibold text-red-700">RESET</span> to confirm
          </label>
          <input
            id="reset-confirm"
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="reset-password" className={labelCls}>
            Your password
          </label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">
            Step-up re-auth: confirms it&apos;s really you behind the keyboard.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm shadow-sm transition-colors hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Resetting…" : "Reset site"}
          </button>
        </div>
      </form>
    </div>
  );
}
