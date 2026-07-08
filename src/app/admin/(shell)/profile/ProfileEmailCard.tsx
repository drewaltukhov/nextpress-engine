"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelEmailChange, requestEmailChange, type MyProfile } from "./actions";
import { changeEmailDirect } from "../users/actions";

interface Props {
  profile: MyProfile;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

function formatExpiresAt(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "in under an hour";
  if (hours === 1) return "in 1 hour";
  return `in ${hours} hours`;
}

export function ProfileEmailCard({ profile }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // Admins skip the confirmation-link flow — direct change against their
      // own row, mirrors what changeEmailDirect already does for admin-on-other.
      // Non-admins still go through the token flow so they prove control of
      // the new address before it becomes their login credential.
      if (profile.isAdmin) {
        const result = await changeEmailDirect(profile.id, newEmail);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const cleaned = newEmail.trim().toLowerCase();
        toast.success(`Email changed to ${cleaned} — signing you out`);
        setNewEmail("");
        setEditing(false);
        // Session was revoked server-side; the freshness gate on the next
        // navigation will bounce to /admin/login. Refresh nudges that along.
        router.refresh();
        return;
      }
      const result = await requestEmailChange(newEmail);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const cleaned = newEmail.trim().toLowerCase();
      toast.success(`Confirmation link sent to ${cleaned}`);
      setNewEmail("");
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancelPending() {
    startTransition(async () => {
      const result = await cancelEmailChange();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pending change canceled");
      router.refresh();
    });
  }

  const pendingChange = profile.pendingEmailChange;

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
        Email address
      </div>

      <div>
        <div className="text-sm text-slate-500">Current</div>
        <div className="text-sm text-slate-900 font-medium">{profile.email}</div>
      </div>

      {pendingChange && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm font-medium text-amber-900">
            Pending change
          </div>
          <p className="mt-1 text-sm text-amber-900/90">
            Confirmation link sent to{" "}
            <span className="font-medium">{pendingChange.newEmail}</span>. The
            link expires {formatExpiresAt(pendingChange.expiresAt)} — your email
            won&apos;t change until you click it.
          </p>
          <button
            type="button"
            onClick={handleCancelPending}
            disabled={pending}
            className="mt-2 text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 disabled:opacity-50"
          >
            Cancel pending change
          </button>
        </div>
      )}

      {!editing && !pendingChange && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Change email
        </button>
      )}

      {editing && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="pe-new-email" className="block text-sm font-medium text-slate-700 mb-1.5">
              New email address
            </label>
            <input
              id="pe-new-email"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputCls}
            />
            <p className="mt-2 text-sm text-slate-500">
              {profile.isAdmin
                ? "Email changes immediately. Your existing session will be revoked — sign in again with the new address."
                : "We'll send a confirmation link to the new address. Your email changes only after you click it."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Saving…" : profile.isAdmin ? "Change email" : "Send confirmation link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNewEmail("");
              }}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
