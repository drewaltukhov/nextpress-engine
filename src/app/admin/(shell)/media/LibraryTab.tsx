"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteFile, getLibrary } from "./actions";
import { useConfirm } from "@core/components/ConfirmDialog";
import type { ListMediaResult, MediaSummary } from "@core-plugins/media/service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import { THUMB_SIZE_LEVELS } from "./thumb-size";

interface Props {
  initial: ListMediaResult;
  canDeleteAny: boolean;
  currentUserId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  refreshSignal: number;
  /** Index into THUMB_SIZE_LEVELS — chooses the responsive grid-cols set. */
  thumbSize: number;
  /** Debounced filename filter from the toolbar; empty string = no filter. */
  search: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LibraryTab({
  initial,
  canDeleteAny,
  currentUserId,
  selectedIds,
  onToggleSelect,
  refreshSignal,
  thumbSize,
  search,
}: Props) {
  const [library, setLibrary] = useState<ListMediaResult>(initial);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const totalPages = Math.max(1, Math.ceil(library.total / library.pageSize));

  // `media.delete` permission grants delete-anything; without it, users can
  // still delete what they uploaded themselves.
  function canDelete(item: MediaSummary): boolean {
    if (canDeleteAny) return true;
    return !!currentUserId && item.uploadedBy === currentUserId;
  }

  function goPage(p: number) {
    startTransition(async () => {
      const next = await getLibrary(p, search);
      setLibrary(next);
    });
  }

  // Parent (MediaPageClient) bumps refreshSignal after a bulk-delete so the
  // grid re-fetches without us having to wire two-way data flow.
  useEffect(() => {
    if (refreshSignal === 0) return;
    let cancelled = false;
    (async () => {
      const next = await getLibrary(library.page, search);
      if (!cancelled) setLibrary(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Refetch from page 1 whenever the debounced search term changes. Skip the
  // initial mount when search is empty — `initial` was already fetched
  // unfiltered, no need to round-trip.
  useEffect(() => {
    if (search === "" && library.page === 1 && library === initial) return;
    let cancelled = false;
    (async () => {
      const next = await getLibrary(1, search);
      if (!cancelled) setLibrary(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(item: MediaSummary) {
    const ok = await confirm({
      title: "Delete this image?",
      description: (
        <>
          <span className="font-mono text-xs break-all">{item.filename}</span> will be removed from the library.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteFile(item.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Deleted");
      const next = await getLibrary(library.page);
      setLibrary(next);
    });
  }

  if (library.rows.length === 0) {
    if (search) {
      return (
        <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No matches</p>
          <p className="mt-1 text-sm text-slate-500">
            No files match <span className="font-mono">&ldquo;{search}&rdquo;</span>.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
        <p className="text-sm font-medium text-slate-900">Library is empty</p>
        <p className="mt-1 text-sm text-slate-500">Use the Upload tab to add your first image.</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`grid ${THUMB_SIZE_LEVELS[thumbSize] ?? THUMB_SIZE_LEVELS[2]} gap-3`}>
        {library.rows.map((item) => {
          const showDelete = canDelete(item);
          const detailHref = `/admin/media/${item.id}`;
          const isSelected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`group rounded-lg overflow-hidden border bg-white hover:shadow-sm transition flex flex-col ${
                isSelected ? "border-brand-green ring-2 ring-brand-green/30" : "border-slate-200 hover:border-brand-green"
              }`}
            >
              <Link href={detailHref} className="relative aspect-square bg-slate-50 block">
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
                {showDelete && (
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-1.5 right-1.5 size-7 rounded-md bg-white/95 border border-slate-200 shadow-sm grid place-items-center cursor-pointer transition-opacity ${
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect(item.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                      aria-label={`Select ${item.filename}`}
                    />
                  </label>
                )}
              </Link>
              <div className="px-2.5 py-2 border-t border-slate-100 flex items-center gap-2">
                <Link href={detailHref} className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-800 truncate">{item.filename}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {formatBytes(item.sizeBytes)}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                  </div>
                </Link>
                {showDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                    disabled={pending}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 shrink-0"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
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
          <span className="text-slate-500">
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
  );
}
