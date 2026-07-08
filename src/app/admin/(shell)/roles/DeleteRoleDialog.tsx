"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteRole, type RoleRow } from "./actions";

interface Props {
  role: RoleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteRoleDialog({ role, open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!role) return;
    startTransition(async () => {
      const result = await deleteRole(role.slug);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Role “${role.label}” deleted`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete role</DialogTitle>
        </DialogHeader>

        {role ? (
          <>
            <p className="text-sm text-slate-600">
              Delete the{" "}
              <span className="font-medium text-slate-900">{role.label}</span>{" "}
              role? Its permission settings are removed and it disappears from
              the role picker. This can&apos;t be undone from the UI.
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
                className="h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Deleting…" : "Delete role"}
              </button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
