"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMediaForPicker } from "@core/media/picker-actions";
import type { ListMediaResult, MediaSummary } from "@core-plugins/media/service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Media ids already in the gallery — disabled in the picker. */
  excludeIds: ReadonlySet<string>;
  onConfirm: (mediaIds: string[]) => Promise<void> | void;
}

export function GalleryAddMediaDialog({ open, onOpenChange, excludeIds, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add media to gallery</DialogTitle>
          <DialogDescription>
            Select one or more images to append to this gallery. Already-included
            files are dimmed.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          // Mount fresh on each open — that's what resets `selected` to []
          // without violating the no-setState-in-effect rule.
          <PickerBody
            excludeIds={excludeIds}
            onCancel={() => onOpenChange(false)}
            onConfirm={async (ids) => {
              await onConfirm(ids);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface PickerBodyProps {
  excludeIds: ReadonlySet<string>;
  onCancel: () => void;
  onConfirm: (mediaIds: string[]) => Promise<void>;
}

function PickerBody({ excludeIds, onCancel, onConfirm }: PickerBodyProps) {
  const [library, setLibrary] = useState<ListMediaResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await listMediaForPicker(1);
      if (!cancelled) setLibrary(next);
    })();
    return () => { cancelled = true; };
  }, []);

  function goPage(p: number) {
    startTransition(async () => {
      const next = await listMediaForPicker(p);
      setLibrary(next);
    });
  }

  function toggle(item: MediaSummary) {
    if (excludeIds.has(item.id)) return;
    setSelected((prev) =>
      prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
    );
  }

  async function handleConfirm() {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(selected);
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = library ? Math.max(1, Math.ceil(library.total / library.pageSize)) : 1;

  return (
    <>
      {library === null ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
          Loading…
        </div>
      ) : library.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No media yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Upload images on the Upload tab first.
          </p>
        </div>
      ) : (
        <div>
          <div
            className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[55vh] overflow-y-auto pr-1 ${
              pending ? "opacity-60" : ""
            }`}
          >
            {library.rows.map((item) => {
              const isSelected = selected.includes(item.id);
              const isExcluded = excludeIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  disabled={isExcluded}
                  className={`group relative aspect-square rounded-lg overflow-hidden border bg-slate-50 transition outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 ${
                    isExcluded
                      ? "border-slate-200 opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "border-brand-green ring-2 ring-brand-green/30"
                        : "border-slate-200 hover:border-brand-green hover:shadow-sm"
                  }`}
                  title={isExcluded ? `${item.filename} (already in gallery)` : item.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getMediaPublicUrl({
                      id: item.id,
                      hasThumb: item.hasThumb,
                      variant: "thumb",
                      contentVersion: item.contentVersion,
                    })}
                    alt={item.altText ?? item.filename}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 size-6 rounded-full bg-brand-green text-white grid place-items-center shadow-sm">
                      <Check className="size-3.5" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => goPage(library.page - 1)}
                disabled={library.page <= 1 || pending}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-slate-500 tabular-nums">
                Page {library.page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => goPage(library.page + 1)}
                disabled={library.page >= totalPages || pending}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected.length === 0 || submitting}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? "Adding…"
            : selected.length === 0
              ? "Add"
              : `Add ${selected.length} ${selected.length === 1 ? "item" : "items"}`}
        </button>
      </DialogFooter>
    </>
  );
}
