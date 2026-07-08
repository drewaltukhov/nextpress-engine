import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmailChange } from "../../(shell)/profile/actions";

export const metadata: Metadata = { title: "Confirm email change" };

// Token-based page that calls a server action — never safe to
// prerender. Mark dynamic so the build doesn't trace its module
// (Next.js 16 doesn't run instrumentation at collect-time, so any DB
// query reachable from this page would otherwise fail the build).
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

const cardCls = "max-w-md mx-auto mt-24 rounded-xl bg-white border border-slate-200 p-8 shadow-sm";
const headingCls = "font-display text-2xl tracking-tight text-brand-navy";
const bodyCls = "mt-3 text-sm text-slate-600 leading-relaxed";
const linkCls = "mt-6 inline-flex items-center justify-center h-10 px-5 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90";

export default async function ConfirmEmailPage({ params }: Props) {
  const { token } = await params;
  const result = await confirmEmailChange(token);

  if (!result.ok) {
    const message =
      result.code === "expired"
        ? "This confirmation link has expired. Start a new email change request from your profile."
        : result.code === "already-consumed"
          ? "This link has already been used."
          : "We couldn't find a matching email-change request — the link may be malformed or already used.";

    return (
      <div className={cardCls}>
        <h1 className={headingCls}>Couldn&apos;t confirm</h1>
        <p className={bodyCls}>{message}</p>
        <Link href="/admin/login" className={linkCls}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <h1 className={headingCls}>Email confirmed</h1>
      <p className={bodyCls}>
        Your NextPress email has been updated to{" "}
        <span className="font-medium text-slate-900">{result.newEmail}</span>.
        Sign in again with the new address to continue.
      </p>
      <Link href="/admin/login" className={linkCls}>
        Sign in
      </Link>
    </div>
  );
}
