"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  saveSmtpSettings,
  testSmtpConnection,
  type SmtpSettings,
} from "./smtp-actions";

interface Props {
  initial: SmtpSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SmtpSettingsForm({ initial }: Props) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [user, setUser] = useState(initial.user);
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState(initial.fromAddress);
  const [pending, startTransition] = useTransition();
  const passwordOnFile = initial.password.length > 0;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveSmtpSettings({ host, port, user, password, fromAddress });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("SMTP settings saved");
      setPassword("");
    });
  }

  function handleTest() {
    startTransition(async () => {
      const result = await testSmtpConnection({ host, port, user, password });
      if (result.ok) {
        toast.success("SMTP connection succeeded");
      } else {
        toast.error(`SMTP test failed: ${result.error}`);
      }
    });
  }

  return (
    <form onSubmit={handleSave}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Server ──────────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Server</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="es-host" className={labelCls}>SMTP host</label>
              <input
                id="es-host"
                type="text"
                placeholder="smtp.gmail.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="es-port" className={labelCls}>SMTP port</label>
              <input
                id="es-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 587)}
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-slate-400">587 for STARTTLS, 465 for implicit TLS.</p>
            </div>
          </div>
        </div>

        {/* ── Authentication ──────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Authentication</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="es-user" className={labelCls}>Username</label>
              <input
                id="es-user"
                type="text"
                placeholder="you@example.com"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="es-password" className={labelCls}>
                Password
                {passwordOnFile && <span className="ml-2 font-normal text-slate-400">(leave blank to keep existing)</span>}
              </label>
              <input
                id="es-password"
                type="password"
                autoComplete="new-password"
                placeholder={passwordOnFile ? "••••••••" : "App password or SMTP password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="es-from" className={labelCls}>From address</label>
              <input
                id="es-from"
                type="email"
                placeholder="noreply@example.com"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

      </div>

      <div className="flex gap-3 mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {host.trim() && (
          <button
            type="button"
            onClick={handleTest}
            disabled={pending}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Test connection
          </button>
        )}
      </div>
    </form>
  );
}
