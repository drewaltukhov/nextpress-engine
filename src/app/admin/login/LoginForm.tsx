"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false
      });
      if (!res || res.error) {
        setError("Invalid email or password.");
        return;
      }
      // Use a hard navigation so middleware re-runs and the dashboard sees the cookie.
      window.location.assign(redirectTo);
    });
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={onSubmit}>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          tabIndex={1}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          className="mt-1.5 block w-full h-11 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-light-green focus:border-brand-green transition disabled:opacity-50"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          tabIndex={2}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          className="mt-1.5 block w-full h-11 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-light-green focus:border-brand-green transition disabled:opacity-50"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        tabIndex={3}
        className="w-full h-11 rounded-md bg-brand-green text-white text-base font-medium shadow-sm hover:bg-brand-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
