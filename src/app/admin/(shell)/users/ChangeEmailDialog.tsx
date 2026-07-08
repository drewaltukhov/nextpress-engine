"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeEmailBootstrap, changeEmailDirect, type UserListItem } from "./actions";
import { isUnverifiableEmail } from "./email-utils";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface BootstrapFormProps {
  user: UserListItem;
  onClose: () => void;
}

function BootstrapForm({ user, onClose }: BootstrapFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newEmail, setNewEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await changeEmailBootstrap(user.id, newEmail);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Email updated to ${newEmail.trim().toLowerCase()}`);
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        This account uses a placeholder address that can&apos;t receive email.
        Set a real address now — no verification needed for this first change.
        Future changes will require email verification.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Current email
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {user.email}
        </div>
      </div>

      <div>
        <label htmlFor="ce-new-email" className="block text-sm font-medium text-slate-700 mb-1.5">
          New email
        </label>
        <input
          id="ce-new-email"
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Set email"}
        </button>
      </DialogFooter>
    </form>
  );
}

interface VerifiedDirectFormProps {
  user: UserListItem;
  onClose: () => void;
}

function VerifiedDirectForm({ user, onClose }: VerifiedDirectFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newEmail, setNewEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await changeEmailDirect(user.id, newEmail);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const cleaned = newEmail.trim().toLowerCase();
      toast.success(`Email updated to ${cleaned}. ${user.displayName} will need to sign in again.`);
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Updates the email immediately. A heads-up will be sent to the old
        address, and{" "}
        <span className="font-medium text-slate-900">{user.displayName}</span>{" "}
        will be signed out so the next login uses the new address.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Current email
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {user.email}
        </div>
      </div>

      <div>
        <label htmlFor="ce-new-email-verified" className="block text-sm font-medium text-slate-700 mb-1.5">
          New email
        </label>
        <input
          id="ce-new-email-verified"
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Update email"}
        </button>
      </DialogFooter>
    </form>
  );
}

export function ChangeEmailDialog({ user, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
        </DialogHeader>

        {user ? (
          isUnverifiableEmail(user.email) ? (
            <BootstrapForm
              key={user.id}
              user={user}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <VerifiedDirectForm
              key={user.id}
              user={user}
              onClose={() => onOpenChange(false)}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
