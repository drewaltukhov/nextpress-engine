"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Star,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import type { GalleryDetail, GalleryItem } from "@core-plugins/galleries";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";
import {
  reorderItemsAction,
  setItemCaptionAction,
  setCoverAction,
  removeItemAction,
  addItemsAction,
  updateGalleryAction,
  deleteGalleryAction,
} from "../actions";
import { GalleryAddMediaDialog } from "./GalleryAddMediaDialog";

interface Props {
  initial: GalleryDetail;
}

export function GalleryEditPageClient({ initial }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<GalleryItem[]>(initial.items);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [coverMediaId, setCoverMediaId] = useState<string | null>(initial.coverMediaId);
  const [addOpen, setAddOpen] = useState(false);
  const [, startTransition] = useTransition();

  const memberIds = useMemo(() => new Set(items.map((i) => i.mediaId)), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.mediaId === active.id);
    const newIndex = items.findIndex((i) => i.mediaId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    startTransition(async () => {
      const result = await reorderItemsAction(initial.id, next.map((i) => i.mediaId));
      if (!result.ok) {
        toast.error(result.error);
        setItems(previous);
      }
    });
  }

  async function handleSaveName(nextName: string): Promise<boolean> {
    const trimmed = nextName.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return false;
    }
    if (trimmed === initial.name && trimmed === name) return true;
    const result = await updateGalleryAction(initial.id, { name: trimmed });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setName(trimmed);
    toast.success("Renamed");
    router.refresh();
    return true;
  }

  async function handleSaveDescription(nextDescription: string): Promise<boolean> {
    const result = await updateGalleryAction(initial.id, {
      description: nextDescription.trim() ? nextDescription.trim() : null,
    });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setDescription(nextDescription);
    toast.success("Description saved");
    return true;
  }

  function handleSetCover(mediaId: string) {
    if (mediaId === coverMediaId) return;
    const previous = coverMediaId;
    setCoverMediaId(mediaId);
    startTransition(async () => {
      const result = await setCoverAction(initial.id, mediaId);
      if (!result.ok) {
        toast.error(result.error);
        setCoverMediaId(previous);
        return;
      }
      toast.success("Cover updated");
    });
  }

  async function handleRemove(item: GalleryItem) {
    const ok = await confirm({
      title: "Remove from gallery?",
      description: (
        <>
          <span className="font-mono text-xs break-all">{item.filename}</span> will
          be removed from this gallery. The file stays in the library.
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const previous = items;
    const next = items.filter((i) => i.mediaId !== item.mediaId);
    setItems(next);
    startTransition(async () => {
      const result = await removeItemAction(initial.id, item.mediaId);
      if (!result.ok) {
        toast.error(result.error);
        setItems(previous);
        return;
      }
      // The server will have promoted a replacement cover if we just
      // removed the current one — sync local state from the response.
      if (item.mediaId === coverMediaId) {
        setCoverMediaId(next[0]?.mediaId ?? null);
      }
      toast.success("Removed");
    });
  }

  function handleSaveCaption(mediaId: string, caption: string) {
    const item = items.find((i) => i.mediaId === mediaId);
    if (!item) return;
    if ((item.caption ?? "") === caption) return;
    const previous = items;
    setItems((curr) =>
      curr.map((i) => (i.mediaId === mediaId ? { ...i, caption: caption || null } : i)),
    );
    startTransition(async () => {
      const result = await setItemCaptionAction(initial.id, mediaId, caption);
      if (!result.ok) {
        toast.error(result.error);
        setItems(previous);
      }
    });
  }

  async function handleAddMedia(mediaIds: string[]) {
    const result = await addItemsAction(initial.id, mediaIds);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Added ${result.inserted} ${result.inserted === 1 ? "item" : "items"}`);
    // Replace local state from the canonical server view — this picks up
    // the newly-joined media rows and any cover the server auto-promoted
    // when the gallery was previously empty.
    setItems(result.gallery.items);
    setCoverMediaId(result.gallery.coverMediaId);
  }

  async function handleDeleteGallery() {
    const ok = await confirm({
      title: "Delete gallery?",
      description:
        items.length > 0
          ? `"${name}" contains ${items.length} ${items.length === 1 ? "item" : "items"}. The media files stay in your library — only the grouping is removed.`
          : `"${name}" will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const result = await deleteGalleryAction(initial.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Gallery deleted");
    router.push("/admin/media?tab=galleries");
  }

  return (
    <div>
      <div className="mb-2">
        <Link
          href="/admin/media?tab=galleries"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to Galleries
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <InlineEditable
            value={name}
            onSave={handleSaveName}
            ariaLabel="Gallery name"
            inputClassName="font-display text-4xl tracking-tight text-brand-navy"
            displayClassName="font-display text-4xl tracking-tight text-brand-navy"
          />
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
            <span>
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-xs">{initial.slug}</span>
          </div>
          <div className="mt-3 max-w-2xl">
            <InlineEditable
              value={description}
              onSave={handleSaveDescription}
              placeholder="Add a description (optional)"
              multiline
              ariaLabel="Gallery description"
              inputClassName="text-sm text-slate-700"
              displayClassName="text-sm text-slate-600"
            />
          </div>
          <EmbedShortcode galleryId={initial.id} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
          >
            <Plus className="size-4" />
            Add media
          </button>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleDeleteGallery}
                  aria-label="Delete gallery"
                  className="inline-flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              }
            />
            <TooltipContent>Delete gallery</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <DndContext
          // Stable id silences the SSR/client aria-describedby mismatch
          // @dnd-kit produces by default (its accessibility module
          // increments an internal counter that resolves differently on
          // each side of the boundary).
          id={`gallery-sort-${initial.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((i) => i.mediaId)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((item) => (
                <SortableMediaCard
                  key={item.mediaId}
                  item={item}
                  isCover={coverMediaId === item.mediaId}
                  onSetCover={() => handleSetCover(item.mediaId)}
                  onRemove={() => handleRemove(item)}
                  onSaveCaption={(caption) => handleSaveCaption(item.mediaId, caption)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <GalleryAddMediaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        excludeIds={memberIds}
        onConfirm={handleAddMedia}
      />
    </div>
  );
}

function EmbedShortcode({ galleryId }: { galleryId: number }) {
  const code = `[gallery id="${galleryId}"]`;
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Embed code copied");
      // Revert the icon after a beat so a second copy still gives feedback.
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1 py-1">
      <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Embed</span>
      <code className="font-mono text-sm text-slate-800 select-all">{code}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy embed code"
        className="inline-flex items-center justify-center size-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white transition-colors"
      >
        {copied ? <Check className="size-3.5" strokeWidth={3} /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm font-medium text-slate-900">No items yet</p>
      <p className="mt-1 text-sm text-slate-500">Add media from your library to get started.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Add media
      </button>
    </div>
  );
}

interface SortableMediaCardProps {
  item: GalleryItem;
  isCover: boolean;
  onSetCover: () => void;
  onRemove: () => void;
  onSaveCaption: (caption: string) => void;
}

function SortableMediaCard({
  item,
  isCover,
  onSetCover,
  onRemove,
  onSaveCaption,
}: SortableMediaCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.mediaId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const [caption, setCaption] = useState(item.caption ?? "");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg overflow-hidden border bg-white transition flex flex-col ${
        isDragging ? "border-brand-green shadow-lg" : "border-slate-200 hover:border-brand-green hover:shadow-sm"
      }`}
    >
      <div className="relative aspect-square bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getMediaPublicUrl({
            id: item.mediaId,
            hasThumb: item.hasThumb,
            variant: "thumb",
            contentVersion: item.contentVersion,
          })}
          alt={item.altText ?? item.filename}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />

        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 size-7 rounded-md bg-white/95 border border-slate-200 shadow-sm grid place-items-center text-slate-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 hover:text-slate-900 transition-opacity"
        >
          <GripVertical className="size-3.5" />
        </button>

        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onSetCover}
                  aria-label={isCover ? "Cover image" : "Set as cover"}
                  className={`size-7 rounded-md border shadow-sm grid place-items-center transition-all ${
                    isCover
                      ? "bg-amber-100 border-amber-300 text-amber-600"
                      : "bg-white/95 border-slate-200 text-slate-500 hover:text-amber-600 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Star className="size-3.5" fill={isCover ? "currentColor" : "none"} strokeWidth={2} />
                </button>
              }
            />
            <TooltipContent>{isCover ? "Cover image" : "Set as cover"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="Remove from gallery"
                  className="size-7 rounded-md bg-white/95 border border-slate-200 shadow-sm grid place-items-center text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="size-3.5" />
                </button>
              }
            />
            <TooltipContent>Remove</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-2.5 py-2 border-t border-slate-100">
        <div className="text-xs font-medium text-slate-800 truncate" title={item.filename}>
          {item.filename}
        </div>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => onSaveCaption(caption)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setCaption(item.caption ?? "");
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder="Caption…"
          maxLength={500}
          className="mt-1 w-full text-[11px] text-slate-600 bg-transparent border-0 outline-none focus:bg-slate-50 rounded px-1 py-0.5 placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}

interface InlineEditableProps {
  value: string;
  onSave: (value: string) => Promise<boolean>;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel: string;
  inputClassName?: string;
  displayClassName?: string;
}

function InlineEditable({
  value,
  onSave,
  placeholder,
  multiline = false,
  ariaLabel,
  inputClassName = "",
  displayClassName = "",
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  async function commit() {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    const displayed = value || placeholder || "";
    return (
      <button
        type="button"
        onClick={startEdit}
        aria-label={`Edit ${ariaLabel}`}
        className="group inline-flex items-start gap-2 text-left rounded-md hover:bg-slate-100/60 px-1 -mx-1 transition-colors"
      >
        <span className={`${displayClassName} ${value ? "" : "text-slate-400 italic"}`}>
          {displayed}
        </span>
        <Pencil className="size-3.5 mt-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  const sharedProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    "aria-label": ariaLabel,
    placeholder,
    disabled: saving,
    className: `w-full rounded-md border border-slate-200 bg-white px-2 py-1 outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition disabled:opacity-50 ${inputClassName}`,
  };

  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <textarea
          {...sharedProps}
          ref={(el) => {
            inputRef.current = el;
          }}
          rows={2}
          maxLength={1000}
        />
      ) : (
        <input
          {...sharedProps}
          type="text"
          ref={(el) => {
            inputRef.current = el;
          }}
          maxLength={100}
        />
      )}
      <div className="flex items-center gap-1 mt-1.5 shrink-0">
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          aria-label="Save"
          className="size-7 rounded-md bg-brand-green text-white grid place-items-center hover:bg-brand-green/90 disabled:opacity-50"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          aria-label="Cancel"
          className="size-7 rounded-md border border-slate-200 bg-white text-slate-500 grid place-items-center hover:bg-slate-50"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
