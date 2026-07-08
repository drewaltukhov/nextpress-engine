"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMediaForPicker } from "@core/media/picker-actions";
import type { ListMediaResult, MediaSummary } from "@core-plugins/media/service";

interface AdminUploadResponse {
  ok: boolean;
  uploaded: Array<MediaSummary & { originalFilename: string }>;
  errors: { filename: string; error: string }[];
}

// ---------------------------------------------------------------------------
// MediaPickerDialog — pure picker, controlled via open/onOpenChange + onPick
// ---------------------------------------------------------------------------

interface PickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: MediaSummary, url: string) => void;
}

export function MediaPickerDialog({ open, onOpenChange, onPick }: PickerDialogProps) {
  const [library, setLibrary] = useState<ListMediaResult | null>(null);
  const [pending, startTransition] = useTransition();
  // Live input value; the actual query is debounced into `debouncedSearch`.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce typing — 250ms is short enough to feel responsive but long
  // enough to skip per-keystroke server roundtrips.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search, open]);

  // Reset the query when the dialog closes so re-opening starts fresh.
  // Handled in the open-change interceptor (not in an effect) so lint's
  // set-state-in-effect rule stays happy.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSearch("");
      setDebouncedSearch("");
    }
    onOpenChange(next);
  }

  // Fetch on open + whenever the debounced query changes. Always resets
  // to page 1 because the page count differs per query.
  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const next = await listMediaForPicker(1, debouncedSearch);
      setLibrary(next);
    });
  }, [open, debouncedSearch]);

  function goPage(p: number) {
    startTransition(async () => {
      const next = await listMediaForPicker(p, debouncedSearch);
      setLibrary(next);
    });
  }

  function handlePick(item: MediaSummary) {
    onPick(item, `/media/${item.id}`);
    handleOpenChange(false);
  }

  const totalPages = library ? Math.max(1, Math.ceil(library.total / library.pageSize)) : 1;
  const hasActiveSearch = debouncedSearch.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick from Media library</DialogTitle>
          <DialogDescription>
            Select an image. Need to upload a new one?{" "}
            <a href="/admin/media" target="_blank" rel="noreferrer">
              Open the Media library
            </a>{" "}
            and refresh this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename…"
            autoFocus
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {library === null ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            Loading…
          </div>
        ) : library.rows.length === 0 ? (
          hasActiveSearch ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-12 text-center">
              <p className="text-sm font-medium text-slate-900">
                No matches for &ldquo;{debouncedSearch}&rdquo;
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different filename, or clear the search to browse everything.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-12 text-center">
              <p className="text-sm font-medium text-slate-900">No media yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Upload images at{" "}
                <a
                  href="/admin/media"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-green underline-offset-2 hover:underline"
                >
                  /admin/media
                </a>
                .
              </p>
            </div>
          )
        ) : (
          <div>
            <div
              className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[60vh] overflow-y-auto pr-1 ${
                pending ? "opacity-60" : ""
              }`}
            >
              {library.rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePick(item)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-brand-green hover:shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
                  title={item.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/media/${item.id}/thumb`}
                    alt={item.altText ?? item.filename}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="truncate text-[10px] font-medium text-white">
                      {item.filename}
                    </div>
                  </div>
                </button>
              ))}
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
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// MediaPickerInput — URL input + thumbnail preview + Browse button
// ---------------------------------------------------------------------------

interface MediaPickerInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Disable manual URL editing — picker-only. Defaults to false. */
  pickerOnly?: boolean;
  /** Show an "Upload" button that uploads a single file to the library
   *  and sets value to the new `/media/{id}` URL. Defaults to false. */
  allowUpload?: boolean;
  /**
   * Visual variant.
   *
   * - `"input"` (default) — single row: small 40px thumb, URL field,
   *   action buttons. Compact, fits sidebar inspectors.
   * - `"preview"` — hides the URL field; large thumbnail above the
   *   action buttons. For cases where URLs are never typed by hand.
   * - `"stacked"` — buttons (and small thumbnail) on top, URL field
   *   full-width on its own row below. Same three entry paths as
   *   `"input"` but lets the URL string breathe when the inspector
   *   column is narrow.
   * - `"natural"` — URL field + buttons on top (same row as `"input"`
   *   but without the inline thumbnail). The image renders on its
   *   own row below at its real aspect ratio (no crop). Good for
   *   logos and other graphics where the shape itself is meaningful.
   */
  variant?: "input" | "preview" | "stacked" | "natural";
}

const inputCls =
  "flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function MediaPickerInput({
  id,
  value,
  onChange,
  placeholder = "https://… or pick from your library",
  className,
  pickerOnly = false,
  allowUpload = false,
  variant = "input",
}: MediaPickerInputProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track per-src failures so a transient onError (e.g. slow dev compile)
  // hides the preview only for that src. When the URL changes (picker /
  // upload / clear), the error flag resets and we try the new image.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  const hasValue = value.length > 0;
  // Path-style values (/media/...) live on the same origin and can render
  // directly. External URLs render as-is too — the broken-image fallback is
  // hidden via the React-managed `erroredSrc` flag rather than mutating
  // the DOM directly (that left old display:none stuck across re-renders).
  const previewSrc = value;
  const previewBroken = !!erroredSrc && erroredSrc === previewSrc;

  async function handleQuickUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // Route handler instead of server action — see #21 fix in
      // src/app/api/admin/media/upload/route.ts.
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const result = (await res.json()) as AdminUploadResponse;
      if (!result.ok || result.uploaded.length === 0) {
        const err = result.errors[0]?.error ?? "Upload failed";
        toast.error(err);
        return;
      }
      const uploaded = result.uploaded[0];
      onChange(`/media/${uploaded.id}`);
      toast.success("Uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const browseButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
    >
      <ImageIcon className="size-4" />
      {hasValue && variant === "preview" ? "Replace" : "Browse"}
    </button>
  );

  const uploadInputAndButton = allowUpload ? (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleQuickUpload(file);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </>
  ) : null;

  const clearButton = hasValue && !pickerOnly ? (
    <button
      type="button"
      onClick={() => onChange("")}
      className="shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors"
      aria-label="Remove"
      title="Remove"
    >
      <X className="size-4" />
    </button>
  ) : null;

  if (variant === "stacked") {
    return (
      <div className={className}>
        <div className="flex items-stretch gap-2">
          {hasValue && !previewBroken && (
            <div className="relative size-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setErroredSrc(previewSrc)}
              />
            </div>
          )}
          {browseButton}
          {uploadInputAndButton}
          {clearButton}
        </div>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={pickerOnly}
          className={`${inputCls} mt-2 w-full`}
        />

        <MediaPickerDialog
          open={open}
          onOpenChange={setOpen}
          onPick={(_item, url) => onChange(url)}
        />
      </div>
    );
  }

  if (variant === "natural") {
    // `max-w-md` caps the picker so the row can't blow past its
    // SettingRow column when the source image is large. `overflow-hidden`
    // on the preview frame plus `object-contain` on the <img> are
    // belt-and-braces against any image whose intrinsic width still
    // tries to push past the cap.
    return (
      <div className={className ? `max-w-md ${className}` : "max-w-md"}>
        <div className="flex items-stretch gap-2">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            readOnly={pickerOnly}
            className={inputCls}
          />
          {browseButton}
          {uploadInputAndButton}
          {clearButton}
        </div>
        {hasValue && !previewBroken && (
          <div className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt=""
              className="block h-auto max-h-20 w-auto max-w-full rounded object-contain"
              onError={() => setErroredSrc(previewSrc)}
            />
          </div>
        )}

        <MediaPickerDialog
          open={open}
          onOpenChange={setOpen}
          onPick={(_item, url) => onChange(url)}
        />
      </div>
    );
  }

  if (variant === "preview") {
    return (
      <div className={className}>
        {hasValue && !previewBroken && (
          <div className="mb-2 relative aspect-video w-full rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setErroredSrc(previewSrc)}
            />
          </div>
        )}
        <div className="flex items-stretch gap-2">
          {browseButton}
          {uploadInputAndButton}
          {clearButton}
        </div>

        <MediaPickerDialog
          open={open}
          onOpenChange={setOpen}
          onPick={(_item, url) => onChange(url)}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-stretch gap-2">
        {hasValue && !previewBroken && (
          <div className="relative size-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setErroredSrc(previewSrc)}
            />
          </div>
        )}
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={pickerOnly}
          className={inputCls}
        />
        {browseButton}
        {uploadInputAndButton}
        {clearButton}
      </div>

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(_item, url) => onChange(url)}
      />
    </div>
  );
}
