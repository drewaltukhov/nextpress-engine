import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@core/db/instance";
import { hashToken } from "@core-plugins/users/tokens";
import { Logo } from "@core/components/Logo";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Set password" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

type TokenPurpose = "reset_password" | "invite";

type TokenState =
  | { state: "ok"; email: string; purpose: TokenPurpose }
  | { state: "not-found" }
  | { state: "expired" }
  | { state: "consumed" };

async function checkToken(token: string): Promise<TokenState> {
  const r = await db().execute({
    sql: `SELECT t.purpose, t.expires_at, t.consumed_at, u.email
          FROM user_email_tokens t
          JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = ?
          LIMIT 1`,
    args: [hashToken(token)]
  });
  const row = r.rows[0];
  if (!row) return { state: "not-found" };
  const rawPurpose = String(row.purpose);
  if (rawPurpose !== "reset_password" && rawPurpose !== "invite") return { state: "not-found" };
  if (row.consumed_at != null) return { state: "consumed" };
  if (new Date(String(row.expires_at)).getTime() < Date.now()) return { state: "expired" };
  return { state: "ok", email: String(row.email), purpose: rawPurpose as TokenPurpose };
}

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;
  const result = await checkToken(token);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight text-brand-navy">
          {result.state === "ok" && result.purpose === "invite" ? "Welcome to NextPress" : "Reset password"}
        </h1>

        {result.state === "ok" ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              {result.purpose === "invite" ? "Set the password for " : "Choose a new password for "}
              <span className="font-medium text-slate-700">{result.email}</span>.
            </p>
            <div className="mt-6">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {result.state === "expired"
                ? "This reset link has expired. Ask an administrator to send a new one."
                : result.state === "consumed"
                ? "This reset link has already been used. If you didn't reset your password, contact an administrator."
                : "This reset link is invalid."}
            </p>
            <div className="mt-6">
              <Link
                href="/admin/login"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
