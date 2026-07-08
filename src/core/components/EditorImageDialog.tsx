"use client";

import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaPickerDialog } from "./MediaPicker";
import type { MediaSummary } from "@core-plugins/media/service";

export type ImageAlignment = "left" | "center" | "right";

export interface ImageInsertOptions {
  src: string;
  alt: string;
  alignment: ImageAlignment;
  /** True only when the source is a media-library pick AND the user opted
   *  in. Marks the inserted node as a clickable thumbnail (lightbox on the
   *  public render). URL-pasted images can't ride the metadata-driven
   *  lightbox path, so the option is hidden in that flow. */
  thumbnail: boolean;
  /** Present only when picked from the media library — used to stamp the
   *  inserted node with `data-np-id` so the public renderer can wire up
   *  alt text, dimensions, and lightbox slides. */
  mediaId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (options: ImageInsertOptions) => void;
  /** When provided, the dialog opens in edit mode pre-filled with these
   *  values; the submit button reads "Update" and the title reflects the
   *  edit context. Null/undefined opens a blank insert form. */
  initial?: ImageInsertOptions | null;
}

/**
 * Image-insert / edit dialog for the RichTextEditor toolbar. Single-screen
 * flow:
 *   1. User pastes a URL + alt OR clicks "Pick from library" (the picker
 *      populates the URL/alt fields and the inline preview).
 *   2. User picks alignment + (library-only) thumbnail mode.
 *   3. Insert/Update finalises everything in one go.
 *
 * Picking from the library does NOT close this dialog — the original
 * single-click insert was too eager, leaving no chance to set alignment.
 */
export function EditorImageDialog({ open, onOpenChange, onInsert, initial }: Props) {
  const editing = initial != null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit image" : "Insert image"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the URL, alt text, alignment, or display mode."
              : "Paste an external URL or pick from your media library, then choose alignment."}
          </DialogDescription>
        </DialogHeader>
        {/* Mount form fresh on every open so a previous session's state
            (URL, alt, alignment) doesn't bleed into the next insert.
            Keying on the initial src ensures switching between edit and
            insert modes resets internal state too. */}
        {open ? (
          <ImageDialogForm
            key={initial?.src ?? "new"}
            initial={initial ?? null}
            onInsert={(options) => {
              onInsert(options);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface FormProps {
  onInsert: (options: ImageInsertOptions) => void;
  onCancel: () => void;
  initial: ImageInsertOptions | null;
}

function ImageDialogForm({ onInsert, onCancel, initial }: FormProps) {
  const editing = initial != null;
  const [src, setSrc] = useState(initial?.src ?? "");
  const [alt, setAlt] = useState(initial?.alt ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [alignment, setAlignment] = useState<ImageAlignment>(initial?.alignment ?? "center");
  const [thumbnail, setThumbnail] = useState(initial?.thumbnail ?? false);
  // Tracks the media id when the source came from the library — drives the
  // visibility of the thumbnail option (URL paste has no lightbox path) and
  // the `data-np-id` marker on the inserted node.
  const [mediaId, setMediaId] = useState<string | null>(initial?.mediaId ?? null);

  function handleLibraryPick(item: MediaSummary) {
    setSrc(`/media/${item.id}`);
    setAlt(item.altText ?? item.filename.replace(/\.[^.]+$/, ""));
    setMediaId(item.id);
    setPickerOpen(false);
  }

  function handleSrcChange(value: string) {
    setSrc(value);
    // Hand-typing into the URL field invalidates the library-pick state;
    // otherwise a user could type their own URL but still ship it with a
    // stale `data-np-id` from a prior library selection.
    if (mediaId !== null) {
      setMediaId(null);
      setThumbnail(false);
    }
  }

  function handleInsert(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = src.trim();
    if (!trimmed) return;
    onInsert({
      src: trimmed,
      alt: alt.trim(),
      alignment,
      thumbnail: thumbnail && mediaId !== null,
      mediaId,
    });
  }

  const hasSrc = src.trim().length > 0;

  return (
    <form onSubmit={handleInsert} className="space-y-4">
      <div>
        <label htmlFor="image-url" className="mb-1.5 block text-xs font-medium text-slate-700">
          Image URL
        </label>
        <div className="relative">
          <ExternalLink className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="image-url"
            type="text"
            value={src}
            onChange={(e) => handleSrcChange(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            autoFocus
            className={`${inputCls} pl-8`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="image-alt" className="mb-1.5 block text-xs font-medium text-slate-700">
          Alt text
        </label>
        <input
          id="image-alt"
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="What's in the image (used for screen readers)"
          className={inputCls}
        />
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 transition hover:border-brand-green hover:bg-brand-green/5 hover:text-brand-green"
      >
        <ImageIcon className="size-4" />
        {mediaId ? "Pick a different image from library" : "Or pick from your media library"}
      </button>

      {/* Live preview reassures the user the URL resolves before inserting. */}
      {hasSrc && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-40 rounded"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-700">Alignment</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          <AlignmentButton
            value="left"
            current={alignment}
            onClick={() => setAlignment("left")}
            label="Left"
            icon={<AlignLeft className="size-4" />}
          />
          <AlignmentButton
            value="center"
            current={alignment}
            onClick={() => setAlignment("center")}
            label="Center"
            icon={<AlignCenter className="size-4" />}
          />
          <AlignmentButton
            value="right"
            current={alignment}
            onClick={() => setAlignment("right")}
            label="Right"
            icon={<AlignRight className="size-4" />}
          />
        </div>
      </div>

      {/* Thumbnail mode is library-only — the public lightbox slide list is
          built from media metadata, which doesn't exist for arbitrary URLs. */}
      {mediaId !== null && (
        <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300">
          <input
            type="checkbox"
            checked={thumbnail}
            onChange={(e) => setThumbnail(e.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-300 text-brand-green focus:ring-2 focus:ring-brand-green/30"
          />
          <span className="text-sm">
            <span className="block font-medium text-slate-900">Insert as thumbnail</span>
            <span className="block text-xs text-slate-500">
              Renders a small clickable preview that opens the full-size image
              in a lightbox.
            </span>
          </span>
        </label>
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
          type="submit"
          disabled={!hasSrc}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {editing ? "Update" : "Insert"}
        </button>
      </DialogFooter>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handleLibraryPick}
      />
    </form>
  );
}

interface AlignmentButtonProps {
  value: ImageAlignment;
  current: ImageAlignment;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

function AlignmentButton({ value, current, onClick, label, icon }: AlignmentButtonProps) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
        active
          ? "bg-brand-green/10 text-brand-green"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
