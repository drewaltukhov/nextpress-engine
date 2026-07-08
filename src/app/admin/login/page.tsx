import type { Metadata } from "next";
import { Logo } from "@core/components/Logo";
import { ENGINE_VERSION } from "@core/version";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

// Auth-flow page — render dynamically so it picks up reason / redirect
// query params, and so the build doesn't try to prerender it (Next.js
// 16 doesn't run instrumentation during page collection, which makes
// any DB query in this module's import trace blow up the build).
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ redirect?: string; reason?: string }>;
}

const REASON_MESSAGE: Record<string, string> = {
  expired: "Your session expired. Sign in again to continue.",
  revoked: "Your session was ended by an admin or password change. Sign in again.",
  user_missing: "Your account is no longer available. Sign in again to continue.",
  missing_iat: "Your session is invalid. Sign in again to continue.",
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const redirectTo = params.redirect && params.redirect.startsWith("/admin") ? params.redirect : "/admin";
  const reasonMessage = params.reason ? REASON_MESSAGE[params.reason] : undefined;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white text-slate-900">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-brand-navy text-white p-12 overflow-hidden">
        <div
          aria-hidden
          className="absolute -right-24 -bottom-40 font-display font-medium text-[32rem] leading-none text-brand-green/15 select-none pointer-events-none"
        >
          {"}"}
        </div>

        <header className="relative">
          <a href="/" className="inline-flex items-center text-white">
            <Logo className="h-9 w-auto" />
          </a>
        </header>

        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-[1.1] tracking-tight">
            A modular publishing engine, built server-first.
          </p>
          <p className="mt-6 text-sm text-white/60 leading-relaxed">
            Posts, terms, options, hooks, plugins, themes — the WordPress mental model on a modern, type-safe stack.
          </p>
        </div>

        <footer className="relative text-sm text-white/40 tracking-wide">v{ENGINE_VERSION}</footer>
      </aside>

      {/* Sign-in panel */}
      <main className="flex flex-col justify-center px-6 py-16 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-10 text-brand-navy">
            <Logo className="h-8 w-auto" />
          </div>

          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Sign in</h1>
          <p className="mt-2 text-base text-slate-500">Continue to your admin dashboard.</p>

          {reasonMessage && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {reasonMessage}
            </div>
          )}

          <LoginForm redirectTo={redirectTo} />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-sm uppercase tracking-wider text-slate-400 font-medium">
                or
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled
            title="Google OAuth lands in a later phase"
            className="w-full inline-flex items-center justify-center gap-3 h-11 rounded-md border border-slate-200 bg-white text-base font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-light-green focus:border-brand-green transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-center text-sm">
            <a
              href="/admin/forgot-password"
              className="text-slate-500 hover:text-brand-green transition"
            >
              Forgot your password?
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
