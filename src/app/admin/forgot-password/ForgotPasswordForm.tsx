"use client";

import { useState, useTransition } from "react";
import { requestSelfPasswordReset } from "./actions";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await requestSelfPasswordReset(email);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-brand-light-green bg-brand-light-green/30 px-4 py-3 text-sm text-slate-700">
        If an account with that email exists, a reset link is on its way. Check
        your inbox — the link is valid for 24 hours.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="fp-email" className="block text-sm font-medium text-slate-700 mb-1.5">
          Email
        </label>
        <input
          id="fp-email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
