"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestPasswordReset } from "../users/actions";
import { isUnverifiableEmail } from "../users/email-utils";

interface Props {
  userId: string;
  email: string;
}

export function ProfilePasswordCard({ userId, email }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const blocked = isUnverifiableEmail(email);

  function handleConfirm() {
    startTransition(async () => {
      const result = await requestPasswordReset(userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reset email sent to ${email}`);
      setOpen(false);
    });
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
        Password
      </div>

      <p className="text-sm text-slate-500">
        We&apos;ll email you a link to choose a new password. The link is valid
        for 24 hours and all existing sessions will be revoked once you save.
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
      >
        Change password
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          {blocked ? (
            <>
              <p className="text-sm text-slate-600">
                Your email{" "}
                <span className="font-medium text-slate-900">{email}</span> is a
                placeholder and can&apos;t receive mail. Set a real email
                address using the card above first, then come back here.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
                >
                  Got it
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Send a reset link to{" "}
                <span className="font-medium text-slate-900">{email}</span>?
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending ? "Sending…" : "Send reset email"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
