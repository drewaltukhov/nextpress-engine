"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { deleteFile } from "../actions";
import { useConfirm } from "@core/components/ConfirmDialog";
import { FormattedDate } from "@core/components/FormattedDate";
import type { MediaSummary } from "@core-plugins/media/service";

interface Props {
  media: MediaSummary;
  canDelete: boolean;
  fullUrl: string;
  thumbUrl: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function altFor(media: MediaSummary): string {
  return media.altText ?? media.filename.replace(/\.[^.]+$/, "");
}

interface CopyRowProps {
  label: string;
  value: string;
}

/**
 * Click-to-copy row. Whole tile is the click target; icon swaps to a check
 * for ~1.5s after copy. Value renders as wrapped monospace text — no internal
 * scrollbar, the box grows with content.
 */
function CopyRow({ label, value }: CopyRowProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not access the clipboard");
    }
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
        {label}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="group w-full flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:bg-slate-100 hover:border-slate-300 transition"
        title={`Copy ${label.toLowerCase()}`}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <code className="flex-1 min-w-0 text-xs font-mono text-slate-800 break-all whitespace-pre-wrap leading-relaxed">
          {value}
        </code>
        {copied ? (
          <Check className="size-4 text-brand-green shrink-0 mt-0.5" />
        ) : (
          <Copy className="size-4 text-slate-400 group-hover:text-brand-green shrink-0 mt-0.5 transition" />
        )}
      </button>
    </div>
  );
}

export function MediaDetailClient({ media, canDelete, fullUrl, thumbUrl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const alt = altFor(media);
  const dimsAttr = media.width && media.height ? ` width="${media.width}" height="${media.height}"` : "";
  const htmlSnippet = `<img src="${fullUrl}" alt="${alt}"${dimsAttr}>`;
  // NextPress shortcodes — drop into any RichText block, the public renderer
  // expands them into a real <img> with click-to-lightbox.
  const imgShortcode = `[img id="${media.id}"]`;
  const thumbShortcode = `[thumb id="${media.id}"]`;

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this image?",
      description: (
        <>
          <span className="font-mono text-xs break-all">{media.filename}</span> will be removed from
          the library.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteFile(media.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Deleted");
      router.push("/admin/media");
    });
  }

  return (
    <div>
      {/* Breadcrumb / back link */}
      <div className="mb-4">
        <Link
          href="/admin/media"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-navy transition"
        >
          <ChevronLeft className="size-4" />
          Back to library
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 items-start">
        {/* ── Image (3/4) ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullUrl}
            alt={alt}
            className="max-w-full max-h-[75vh] object-contain"
          />
        </div>

        {/* ── Sidebar (1/4) ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Metadata table */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
              Details
            </div>
            <dl className="text-sm space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Name</dt>
                <dd className="text-slate-900 truncate text-right" title={media.filename}>
                  {media.filename}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Type</dt>
                <dd className="text-slate-900 font-mono text-xs">{media.mime}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Size</dt>
                <dd className="text-slate-900 tabular-nums">{formatBytes(media.sizeBytes)}</dd>
              </div>
              {media.width && media.height && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500 shrink-0">Dimensions</dt>
                  <dd className="text-slate-900 tabular-nums">
                    {media.width} × {media.height}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Uploaded</dt>
                <dd className="text-slate-900 text-xs text-right">
                  <FormattedDate iso={media.uploadedAt} />
                </dd>
              </div>
            </dl>
          </div>

          {/* URLs + snippets */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              Embed
            </div>
            <CopyRow label="Image URL" value={fullUrl} />
            <CopyRow label="Thumbnail URL" value={thumbUrl} />
            <CopyRow label="HTML" value={htmlSnippet} />
            <CopyRow label="Shortcode — image" value={imgShortcode} />
            <CopyRow label="Shortcode — thumbnail" value={thumbShortcode} />
          </div>

          {/* Delete */}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition"
            >
              <Trash2 className="size-4" />
              {pending ? "Deleting..." : "Delete this media"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
