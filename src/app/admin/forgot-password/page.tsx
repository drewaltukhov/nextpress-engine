import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@core/components/Logo";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password" };

// Skip static prerender. Next.js 16 doesn't run the instrumentation
// hook (which applies migrations + boots plugins) when collecting page
// data, so anything in this page's module trace that reaches a DB query
// crashes the build with `no such table: site_settings`. The page is an
// auth-flow form — static rendering buys nothing.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight text-brand-navy">
          Forgot password
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your account email and we&apos;ll send you a link to choose a new password.
        </p>

        <div className="mt-6">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/admin/login"
            className="text-slate-500 hover:text-brand-green transition"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
