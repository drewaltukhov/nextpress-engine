"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { completePasswordReset } from "./actions";
import { PASSWORD_RULES } from "./password-rules";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const ruleStatus = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.check(password) })),
    [password]
  );
  const allPassed = ruleStatus.every((r) => r.passed);
  const matches = password.length > 0 && password === confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    startTransition(async () => {
      const result = await completePasswordReset(token, password);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Password updated — you can now sign in.");
      setDone(true);
      setTimeout(() => router.push("/admin/login"), 1200);
    });
  }

  if (done) {
    return (
      <div className="text-sm text-slate-600">
        Password updated. Redirecting to sign in&hellip;
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="rp-password" className="block text-sm font-medium text-slate-700 mb-1.5">
          New password
        </label>
        <input
          id="rp-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />

        <ul className="mt-3 space-y-1.5">
          {ruleStatus.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 text-sm transition-colors ${
                r.passed ? "text-brand-green" : "text-slate-400"
              }`}
            >
              {r.passed ? (
                <Check className="size-3.5 shrink-0" strokeWidth={3} />
              ) : (
                <Circle className="size-3.5 shrink-0" strokeWidth={2} />
              )}
              <span className={r.passed ? "text-slate-700" : ""}>{r.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor="rp-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
          Confirm new password
        </label>
        <input
          id="rp-confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
        />
        {confirm.length > 0 && !matches && (
          <p className="mt-2 text-sm text-red-600">Passwords don&apos;t match.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !allPassed || !matches}
        className="h-10 w-full rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
