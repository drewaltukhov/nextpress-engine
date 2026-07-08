"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeSlug } from "@core/slugs/normalize";
import { createGalleryAction } from "./galleries/actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: navigate into the new gallery's edit screen after creation. */
  navigateOnCreate?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function GalleryDialog({ open, onOpenChange, navigateOnCreate = true }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create gallery</DialogTitle>
        </DialogHeader>
        {open ? (
          <CreateGalleryForm
            onClose={() => onOpenChange(false)}
            navigateOnCreate={navigateOnCreate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateGalleryForm({
  onClose,
  navigateOnCreate,
}: {
  onClose: () => void;
  navigateOnCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const previewSlug = useMemo(() => {
    const source = slug.trim() || name;
    return normalizeSlug(source);
  }, [name, slug]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createGalleryAction({ name, slug, description });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Gallery created");
      onClose();
      if (navigateOnCreate && result.id !== undefined) {
        router.push(`/admin/media/galleries/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="g-name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Name
        </label>
        <input
          id="g-name"
          type="text"
          required
          autoFocus
          maxLength={100}
          placeholder="e.g. Vacation 2024"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="g-slug" className="block text-sm font-medium text-slate-700 mb-1.5">
          Slug <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="g-slug"
          type="text"
          maxLength={100}
          placeholder="Leave blank to derive from name"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={`${inputCls} font-mono`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Will be saved as <code className="font-mono text-slate-700">{previewSlug || "—"}</code>
        </p>
      </div>

      <div>
        <label htmlFor="g-description" className="block text-sm font-medium text-slate-700 mb-1.5">
          Description <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="g-description"
          rows={3}
          maxLength={1000}
          placeholder="Short summary shown in the list."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          {pending ? "Creating…" : "Create gallery"}
        </button>
      </DialogFooter>
    </form>
  );
}
