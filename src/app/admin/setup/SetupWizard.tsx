"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { completeSetup, type SetupData } from "./actions";

// ---------------------------------------------------------------------------
// Shared styles (matching login page conventions)
// ---------------------------------------------------------------------------

const inputClass =
  "mt-1.5 block w-full h-11 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-light-green focus:border-brand-green transition disabled:opacity-50";

const labelClass = "block text-sm font-medium text-slate-700";

const primaryBtnClass =
  "h-11 rounded-md bg-brand-green text-white text-base font-medium shadow-sm hover:bg-brand-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition disabled:opacity-60";

const secondaryBtnClass =
  "h-11 rounded-md border border-slate-300 bg-white text-base font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-light-green transition disabled:opacity-60";

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = ["Site", "Admin", "Review"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <nav className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${done ? "bg-brand-green" : "bg-slate-200"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  done
                    ? "bg-brand-green text-white"
                    : active
                      ? "bg-brand-navy text-white"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? "\u2713" : i + 1}
              </div>
              <span
                className={`text-sm font-medium ${
                  active ? "text-brand-navy" : done ? "text-brand-green" : "text-slate-400"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  siteTitle: string;
  siteTagline: string;
  siteUrl: string;
  siteTimezone: string;
  adminEmail: string;
  adminDisplayName: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  installDemoContent: boolean;
}

const initialState: FormState = {
  siteTitle: "NextPress",
  siteTagline: "",
  siteUrl: "",
  siteTimezone: "UTC",
  adminEmail: "",
  adminDisplayName: "James Bond",
  adminPassword: "",
  adminPasswordConfirm: "",
  installDemoContent: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Pre-fill Site URL + timezone from browser APIs on mount. Done in useEffect
  // (not useState init) to avoid SSR hydration mismatch — Intl resolves to the
  // server's tz during SSR but the browser's tz on the client.
  useEffect(() => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount sync from browser APIs
    setForm((prev) => ({
      ...prev,
      siteUrl: prev.siteUrl || window.location.origin,
      siteTimezone: prev.siteTimezone === "UTC" ? detectedTz : prev.siteTimezone,
    }));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function next() {
    setError(null);

    if (step === 0) {
      if (!form.siteTitle.trim()) {
        setError("Site title is required.");
        return;
      }
    }

    if (step === 1) {
      if (!form.adminEmail.trim()) {
        setError("Email is required.");
        return;
      }
      if (!form.adminDisplayName.trim()) {
        setError("Display name is required.");
        return;
      }
      if (!form.adminPassword) {
        setError("Password is required.");
        return;
      }
      if (form.adminPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (form.adminPassword !== form.adminPasswordConfirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    setStep((s) => s - 1);
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const data: SetupData = {
        siteTitle: form.siteTitle,
        siteTagline: form.siteTagline,
        siteUrl: form.siteUrl,
        siteTimezone: form.siteTimezone,
        adminEmail: form.adminEmail,
        adminDisplayName: form.adminDisplayName,
        adminPassword: form.adminPassword,
        installDemoContent: form.installDemoContent,
      };

      const res = await completeSetup(data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.assign("/admin/login");
    });
  }

  // Timezones for the select dropdown
  const timezones = typeof Intl !== "undefined" && Intl.supportedValuesOf
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

  return (
    <div>
      <StepIndicator current={step} />

      {/* ── Step 1: Site Basics ─────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl tracking-tight text-brand-navy">
            Site basics
          </h2>
          <p className="text-sm text-slate-500">
            Configure your site&apos;s identity. You can change these later in Settings.
          </p>

          <div>
            <label htmlFor="siteTitle" className={labelClass}>Site title *</label>
            <input
              id="siteTitle"
              type="text"
              required
              value={form.siteTitle}
              onChange={(e) => set("siteTitle", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="siteTagline" className={labelClass}>Tagline</label>
            <input
              id="siteTagline"
              type="text"
              placeholder="A short description of your site"
              value={form.siteTagline}
              onChange={(e) => set("siteTagline", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="siteUrl" className={labelClass}>Site URL</label>
            <input
              id="siteUrl"
              type="url"
              placeholder="https://example.com"
              value={form.siteUrl}
              onChange={(e) => set("siteUrl", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="siteTimezone" className={labelClass}>Timezone</label>
            <div className="mt-1.5">
              <Select
                value={form.siteTimezone}
                onValueChange={(v) => set("siteTimezone", v ?? form.siteTimezone)}
              >
                <SelectTrigger id="siteTimezone" className="h-11 text-base">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Admin Account ──────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl tracking-tight text-brand-navy">
            Admin account
          </h2>
          <p className="text-sm text-slate-500">
            Create your administrator account. This will be the first user with full access.
          </p>

          <div>
            <label htmlFor="adminEmail" className={labelClass}>Email *</label>
            <input
              id="adminEmail"
              type="email"
              required
              placeholder="you@example.com"
              autoComplete="email"
              value={form.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="adminDisplayName" className={labelClass}>Display name *</label>
            <input
              id="adminDisplayName"
              type="text"
              required
              placeholder="Your Name"
              value={form.adminDisplayName}
              onChange={(e) => set("adminDisplayName", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="adminPassword" className={labelClass}>Password *</label>
            <input
              id="adminPassword"
              type="password"
              required
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={form.adminPassword}
              onChange={(e) => set("adminPassword", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="adminPasswordConfirm" className={labelClass}>Confirm password *</label>
            <input
              id="adminPasswordConfirm"
              type="password"
              required
              placeholder="Repeat your password"
              autoComplete="new-password"
              value={form.adminPasswordConfirm}
              onChange={(e) => set("adminPasswordConfirm", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Review ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl tracking-tight text-brand-navy">
            Review &amp; complete
          </h2>
          <p className="text-sm text-slate-500">
            Everything looks good? Hit &quot;Complete setup&quot; to finish.
          </p>

          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
            <ReviewRow label="Site title" value={form.siteTitle} />
            {form.siteTagline && <ReviewRow label="Tagline" value={form.siteTagline} />}
            {form.siteUrl && <ReviewRow label="Site URL" value={form.siteUrl} />}
            <ReviewRow label="Timezone" value={form.siteTimezone.replace(/_/g, " ")} />
            <ReviewRow label="Admin email" value={form.adminEmail} />
            <ReviewRow label="Admin name" value={form.adminDisplayName} />
            <ReviewRow label="Password" value="••••••••" />
          </div>

          <label className="mt-5 flex items-start gap-2 cursor-pointer">
            <input
              id="installDemoContent"
              type="checkbox"
              checked={form.installDemoContent}
              onChange={(e) => set("installDemoContent", e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
              aria-describedby="installDemoContent-desc"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">Install demo content</span> so I can see all features in action.
              <span id="installDemoContent-desc" className="block text-xs text-slate-500 mt-0.5">
                Includes sample pages, posts, media, menus, topics, and a configured theme.
                You can wipe it later from Admin &rarr; Reset.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            disabled={pending}
            className={`flex-1 ${secondaryBtnClass}`}
          >
            Back
          </button>
        )}

        {step < 2 && (
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className={`flex-1 ${primaryBtnClass}`}
          >
            Continue
          </button>
        )}

        {step === 2 && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={pending}
            className={`flex-1 ${primaryBtnClass}`}
          >
            {pending ? "Setting up..." : "Complete setup"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
