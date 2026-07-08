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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRedirectAction } from "./actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus: number;
}

const STATUS_OPTIONS = [
  { value: "301", label: "301 — Moved Permanently" },
  { value: "302", label: "302 — Found (Temporary)" },
  { value: "307", label: "307 — Temporary Redirect" },
  { value: "308", label: "308 — Permanent Redirect" },
  { value: "410", label: "410 — Gone (no destination)" },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function CreateRedirectDialog({ open, onOpenChange, defaultStatus }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create redirect</DialogTitle>
        </DialogHeader>
        {open ? (
          <CreateRedirectForm
            key={defaultStatus}
            defaultStatus={defaultStatus}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  defaultStatus: number;
  onClose: () => void;
}

function CreateRedirectForm({ defaultStatus, onClose }: FormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [status, setStatus] = useState(String(defaultStatus));
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createRedirectAction({
        fromPath,
        toPath,
        status: Number(status),
        notes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Redirect created");
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="rd-from" className="block text-sm font-medium text-slate-700 mb-1.5">
          From path
        </label>
        <input
          id="rd-from"
          type="text"
          required
          autoFocus
          placeholder="/old-url"
          value={fromPath}
          onChange={(e) => setFromPath(e.target.value)}
          className={`${inputCls} font-mono`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Must start with <code>/</code>. Path-only — no hostname.
        </p>
      </div>

      <div>
        <label htmlFor="rd-to" className="block text-sm font-medium text-slate-700 mb-1.5">
          To path
        </label>
        <input
          id="rd-to"
          type="text"
          required
          placeholder="/new-url"
          value={toPath}
          onChange={(e) => setToPath(e.target.value)}
          className={`${inputCls} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="rd-status" className="block text-sm font-medium text-slate-700 mb-1.5">
          Status code
        </label>
        <Select value={status} onValueChange={(v) => { if (v) setStatus(v); }}>
          <SelectTrigger className="w-full" id="rd-status">
            <SelectValue>
              {STATUS_OPTIONS.find((o) => o.value === status)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor="rd-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
          Notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="rd-notes"
          rows={6}
          placeholder="e.g. migrated from old blog"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
          {pending ? "Creating…" : "Create redirect"}
        </button>
      </DialogFooter>
    </form>
  );
}
