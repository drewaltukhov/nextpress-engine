"use client";

import { useState } from "react";
import { Image as ImageIcon, Pencil } from "lucide-react";
import { GalleryPickerDialog } from "@core-plugins/galleries/components/GalleryPickerDialog";
import { useGalleryRegister } from "@core-plugins/galleries/components/GalleryRegisterContext";
import type { GalleryDetail } from "@core-plugins/galleries";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface GalleryPickerFieldProps {
  value: number | null;
  onChange: (next: number | null) => void;
}

/**
 * Custom Puck field rendered inside the inspector. Opens GalleryPickerDialog
 * and, on pick, fires both `onChange(galleryId)` and the surrounding
 * GalleryRegisterContext's `register(detail)` so the editor's canvas
 * preview can render the real layout immediately (without waiting for a
 * separate fetch round-trip).
 */
export function GalleryPickerField({ value, onChange }: GalleryPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [pickedDetail, setPickedDetail] = useState<GalleryDetail | null>(null);
  const api = useGalleryRegister();

  function handlePick(detail: GalleryDetail) {
    setPickedDetail(detail);
    api?.register(detail);
    onChange(detail.id);
  }

  // Resolve the gallery detail to render in the trigger:
  //   1. The freshly-picked detail (if it matches the current value).
  //   2. The editor's cache (seeded on mount from saved puckData) so the
  //      thumbnail + name show immediately when reopening a saved page.
  const display: GalleryDetail | null =
    pickedDetail && pickedDetail.id === value
      ? pickedDetail
      : value != null
        ? api?.getGallery(value) ?? null
        : null;

  return (
    <div className="space-y-2">
      {value == null ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 transition hover:border-brand-green hover:bg-brand-green/5"
        >
          <ImageIcon className="size-4" />
          Pick a gallery
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <div className="size-12 shrink-0 overflow-hidden rounded bg-slate-100">
            {display?.coverMediaId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getMediaPublicUrl({
                  id: display.coverMediaId,
                  hasThumb: display.coverHasThumb,
                  variant: "thumb",
                  contentVersion: display.coverContentVersion,
                })}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">
              {display?.name ?? `Gallery #${value}`}
            </div>
            <div className="truncate text-xs text-slate-500">
              {display ? `${display.itemCount} item${display.itemCount === 1 ? "" : "s"}` : "Loading…"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="size-3" />
            Change
          </button>
        </div>
      )}

      <GalleryPickerDialog open={open} onOpenChange={setOpen} onPick={handlePick} />
    </div>
  );
}
