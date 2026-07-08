"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestPasswordReset, type UserListItem } from "./actions";
import { isUnverifiableEmail } from "./email-utils";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToChangeEmail: (user: UserListItem) => void;
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onSwitchToChangeEmail,
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!user) return;
    startTransition(async () => {
      const result = await requestPasswordReset(user.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reset email sent to ${user.email}`);
      onOpenChange(false);
    });
  }

  const blocked = user ? isUnverifiableEmail(user.email) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>

        {user ? (
          blocked ? (
            <>
              <p className="text-sm text-slate-600">
                This account&apos;s email{" "}
                <span className="font-medium text-slate-900">{user.email}</span>{" "}
                is a placeholder and can&apos;t receive mail. Set a real email
                address first, then come back here to send the reset.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchToChangeEmail(user)}
                  className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90"
                >
                  Change email
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Email{" "}
                <span className="font-medium text-slate-900">{user.email}</span> a
                link to choose a new password? The link is valid for 24 hours
                and all existing sessions will be revoked once the reset
                completes.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
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
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
