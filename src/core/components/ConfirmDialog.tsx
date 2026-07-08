"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  /** Body — plain text or any ReactNode. */
  description?: ReactNode;
  /** Label for the confirm button. Default: "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Default: "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button red — for destructive actions. Default: false. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface QueueItem extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * App-wide confirm-dialog provider. Mount once at the admin shell layout.
 * Replaces native `window.confirm()` with a styled dialog backed by our
 * Dialog primitive. Call sites use the `useConfirm()` hook.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<QueueItem | null>(null);
  // Resolver is stored on the item; the ref guards against double-resolve
  // when the dialog closes via cancel + then re-renders.
  const resolvedRef = useRef(false);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolvedRef.current = false;
      setCurrent({ ...opts, resolve });
    });
  }, []);

  function settle(answer: boolean) {
    if (!current || resolvedRef.current) return;
    resolvedRef.current = true;
    current.resolve(answer);
    setCurrent(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{current?.title ?? ""}</DialogTitle>
          </DialogHeader>
          {current?.description ? (
            <DialogDescription className="px-1 pb-2 text-slate-600">
              {current.description}
            </DialogDescription>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {current?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={current?.danger ? "destructive" : "default"}
              onClick={() => settle(true)}
              className={
                current?.danger
                  ? "bg-red-600 text-white hover:bg-red-700 border-red-600 focus-visible:ring-red-300"
                  : undefined
              }
            >
              {current?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async confirm function. Resolves true on confirm, false on
 * cancel or backdrop dismiss.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete?", danger: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}
