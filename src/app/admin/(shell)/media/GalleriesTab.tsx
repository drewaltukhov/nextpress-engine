"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ImageIcon, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import { timeAgo } from "@core/datetime";
import type { GalleryListItem } from "@core-plugins/galleries";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import { GalleryDialog } from "./GalleryDialog";
import { deleteGalleryAction } from "./galleries/actions";

interface Props {
  initial: GalleryListItem[];
}

export function GalleriesTab({ initial }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Named, ordered sets of media reusable across content.
        </p>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Create gallery
        </button>
      </div>

      {initial.length === 0 ? (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {initial.map((g) => (
            <GalleryCard key={g.id} gallery={g} />
          ))}
        </div>
      )}

      <GalleryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <ImageIcon className="mx-auto size-8 text-slate-300" />
      <p className="mt-3 text-sm font-medium text-slate-900">No galleries yet</p>
      <p className="mt-1 text-sm text-slate-500">Create one to group related media.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Create your first gallery
      </button>
    </div>
  );
}

function GalleryCard({ gallery }: { gallery: GalleryListItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const detailHref = `/admin/media/galleries/${gallery.id}`;

  async function handleCopyEmbed(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const code = `[gallery id="${gallery.id}"]`;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Embed code copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "Delete gallery?",
      description:
        gallery.itemCount > 0
          ? `"${gallery.name}" contains ${gallery.itemCount} ${gallery.itemCount === 1 ? "item" : "items"}. The media files stay in your library — only the grouping is removed.`
          : `"${gallery.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteGalleryAction(gallery.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Gallery deleted");
      router.refresh();
    });
  }

  const updated = timeAgo(gallery.updatedAt);

  return (
    <Link
      href={detailHref}
      className="group rounded-xl overflow-hidden border border-slate-200 bg-white hover:border-brand-green hover:shadow-sm transition flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-slate-50">
        {gallery.coverMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getMediaPublicUrl({
              id: gallery.coverMediaId,
              hasThumb: gallery.coverHasThumb,
              variant: "thumb",
              contentVersion: gallery.coverContentVersion,
            })}
            alt={gallery.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-slate-300">
            <ImageIcon className="size-10" />
          </div>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={handleCopyEmbed}
                aria-label={`Copy embed code for ${gallery.name}`}
                className="absolute top-2 left-2 size-8 rounded-md bg-white/95 border border-slate-200 shadow-sm grid place-items-center text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-900 transition-all"
              >
                {copied ? <Check className="size-3.5" strokeWidth={3} /> : <Copy className="size-3.5" />}
              </button>
            }
          />
          <TooltipContent>{copied ? "Copied!" : `Copy [gallery id="${gallery.id}"]`}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                aria-label={`Delete ${gallery.name}`}
                className="absolute top-2 right-2 size-8 rounded-md bg-white/95 border border-slate-200 shadow-sm grid place-items-center text-slate-500 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
              </button>
            }
          />
          <TooltipContent>Delete gallery</TooltipContent>
        </Tooltip>
      </div>
      <div className="px-3 py-2.5 border-t border-slate-100">
        <div className="font-medium text-slate-900 truncate">{gallery.name}</div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="tabular-nums">
            {gallery.itemCount} {gallery.itemCount === 1 ? "item" : "items"}
          </span>
          <span className="truncate">Updated {updated}</span>
        </div>
      </div>
    </Link>
  );
}

