"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGalleries, getGalleryDetail } from "@/app/admin/(shell)/media/galleries/actions";
import type { GalleryDetail, GalleryListItem } from "../service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired with the picked gallery's full detail so the caller can both
   *  store the id (in block props) and prime its detail cache (for the
   *  WYSIWYG editor preview) in a single round-trip. */
  onPick: (detail: GalleryDetail) => void;
}

export function GalleryPickerDialog({ open, onOpenChange, onPick }: Props) {
  const [galleries, setGalleries] = useState<GalleryListItem[] | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [pickPending, startPickTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const next = await getGalleries();
      setGalleries(next);
    });
  }, [open]);

  function handlePick(g: GalleryListItem) {
    startPickTransition(async () => {
      const detail = await getGalleryDetail(g.id);
      if (!detail) return;
      onPick(detail);
      onOpenChange(false);
    });
  }

  const filtered = (galleries ?? []).filter((g) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.slug.toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick a gallery</DialogTitle>
          <DialogDescription>
            Pick from the galleries you&apos;ve created. Need a new one?{" "}
            <a href="/admin/media/galleries" target="_blank" rel="noreferrer">
              Open the Galleries admin
            </a>{" "}
            and refresh this dialog.
          </DialogDescription>
        </DialogHeader>

        {galleries === null ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            Loading…
          </div>
        ) : galleries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No galleries yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create one at{" "}
              <a
                href="/admin/media/galleries"
                target="_blank"
                rel="noreferrer"
                className="text-brand-green underline-offset-2 hover:underline"
              >
                /admin/media/galleries
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search galleries…"
                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
                autoFocus
              />
            </div>

            <ul
              className={`max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 ${
                pending || pickPending ? "opacity-60" : ""
              }`}
            >
              {filtered.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(g)}
                    disabled={pickPending}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed"
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded bg-slate-100">
                      {g.coverMediaId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getMediaPublicUrl({
                            id: g.coverMediaId,
                            hasThumb: g.coverHasThumb,
                            variant: "thumb",
                            contentVersion: g.coverContentVersion,
                          })}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {g.name}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {g.itemCount} item{g.itemCount === 1 ? "" : "s"} · /{g.slug}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500">
                  No galleries match &quot;{filter}&quot;.
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
