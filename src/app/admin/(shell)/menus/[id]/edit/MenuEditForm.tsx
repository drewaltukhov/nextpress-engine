"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Layers,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@core/components/ConfirmDialog";
import type {
  MenuDetail,
  MenuItemDetail,
  MenuItemType,
  MenuItemTarget,
  MenuStyle,
} from "@core-plugins/menus";
import type { PickerOption, PillarPickerOption } from "../../picker-actions";
import {
  updateMenuAction,
  addMenuItemAction,
  addPillarWithSpikesAction,
  updateMenuItemAction,
  deleteMenuItemAction,
  moveMenuItemAction,
} from "../../actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** UI-level type enum. Adds the "pillar" pseudo-type, which on submit
 *  expands into a pillar `post` menu item PLUS one child `post` item
 *  per spike — see `addPillarWithSpikesAction`. The DB schema only
 *  knows the four base types in `MenuItemType`. */
type UiItemType = MenuItemType | "pillar";

interface PickerOptions {
  pages: PickerOption[];
  posts: PickerOption[];
  topics: PickerOption[];
  pillars: PillarPickerOption[];
}

interface Props {
  initial: MenuDetail;
  pickerOptions: PickerOptions;
  /** menu_item_ids that already have a saved mega panel — drives the
   *  per-row "Edit mega panel" vs "Add mega panel" label. Top-level items
   *  only; sub-items don't show the affordance. */
  itemsWithPanels: number[];
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function MenuEditForm({ initial, pickerOptions, itemsWithPanels }: Props) {
  const itemsWithPanelsSet = new Set(itemsWithPanels);
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [location, setLocation] = useState(initial.location ?? "");
  const [style, setStyle] = useState<MenuStyle>(initial.style ?? "dropdowns");
  // System menus are detected by LOCATION ('primary' / 'footer') — the
  // theme looks them up by location, not slug. Editing the location
  // would orphan the theme reference, so the input is locked. Name +
  // style remain editable.
  const isSystemMenu =
    initial.location === "primary" || initial.location === "footer";
  // Footer menus don't support mega panels — panels need horizontal real
  // estate the footer doesn't have. Drives both the style picker and the
  // per-item mega affordance below. Items that already have a saved panel
  // keep their affordance regardless, so existing panels never become
  // unreachable if a menu lands on the footer location.
  const isFooterMenu = initial.location === "footer";
  const [savingMeta, startSaveMeta] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemDetail | null>(null);

  function saveMeta() {
    startSaveMeta(async () => {
      const r = await updateMenuAction(initial.id, {
        name: name.trim() || initial.name,
        location: location.trim() || null,
        style,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Menu updated");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/menus"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-green"
        >
          <ArrowLeft className="size-3" />
          Back to Menus
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-brand-navy">{initial.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{initial.itemCount} item{initial.itemCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Menu details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Menu style</label>
            <Select value={style} onValueChange={(v) => setStyle(v as MenuStyle)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {style === "top-level-only"
                    ? "Top level only"
                    : style === "mega"
                    ? "Mega menu"
                    : "Dropdowns"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-level-only">Top level only</SelectItem>
                <SelectItem value="dropdowns">Dropdowns</SelectItem>
                {!isFooterMenu && <SelectItem value="mega">Mega menu</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Location <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. primary"
              disabled={isSystemMenu}
              title={isSystemMenu ? "Reserved system menu — location is fixed" : undefined}
              className={`${inputCls} font-mono ${
                isSystemMenu ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
              }`}
            />
            {isSystemMenu && (
              <p className="mt-1 text-[11px] text-slate-500">
                Reserved system menu — location is fixed.
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          <strong>Top level only</strong> hides children. <strong>Dropdowns</strong>
          {" "}shows hover/focus submenus. <strong>Mega menu</strong> lets root
          items carry per-item mega panels — flipping to Dropdowns hides any
          saved panels without deleting them.
        </p>
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={saveMeta}
            disabled={savingMeta}
            className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-brand-navy px-4 text-sm font-medium text-white hover:bg-brand-navy/90 disabled:opacity-50"
          >
            <Save className="size-4" />
            {savingMeta ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Items</h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-brand-green px-3 text-xs font-medium text-white hover:bg-brand-green/90"
          >
            <Plus className="size-3.5" />
            Add item
          </button>
        </div>
        {initial.items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No items yet — click <strong>Add item</strong> to start building this menu.
          </p>
        ) : (
          <ItemsList
            menuId={initial.id}
            items={initial.items}
            itemsWithPanels={itemsWithPanelsSet}
            showMegaAffordance={!isFooterMenu}
            onEdit={(item) => setEditingItem(item)}
            onChanged={() => router.refresh()}
          />
        )}
      </section>

      {adding ? (
        <ItemDialog
          mode="create"
          menuId={initial.id}
          pickerOptions={pickerOptions}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
      {editingItem ? (
        <ItemDialog
          mode="edit"
          menuId={initial.id}
          item={editingItem}
          pickerOptions={pickerOptions}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ItemsList({
  menuId,
  items,
  itemsWithPanels,
  showMegaAffordance,
  onEdit,
  onChanged,
}: {
  menuId: number;
  items: MenuItemDetail[];
  itemsWithPanels: Set<number>;
  showMegaAffordance: boolean;
  onEdit: (item: MenuItemDetail) => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Group by parent for indent rendering. The service returns items in
  // tree order (parent NULLS first, then position) so a single pass that
  // keeps a depth map suffices.
  const tree = buildFlatWithDepth(items);

  function move(item: MenuItemDetail, delta: -1 | 1) {
    startTransition(async () => {
      const r = await moveMenuItemAction(menuId, item.id, {
        parentId: item.parentId,
        position: item.position + delta,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onChanged();
    });
  }

  function indent(item: MenuItemDetail) {
    // New parent = the previous sibling at the same depth.
    const siblings = items.filter(
      (i) => i.parentId === item.parentId && i.position < item.position,
    );
    const newParent = siblings[siblings.length - 1];
    if (!newParent) {
      toast.error("Nothing above this item to nest under.");
      return;
    }
    startTransition(async () => {
      const r = await moveMenuItemAction(menuId, item.id, {
        parentId: newParent.id,
        position: 9999,        // service clamps to end of destination
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onChanged();
    });
  }

  function outdent(item: MenuItemDetail) {
    if (item.parentId == null) {
      toast.error("Already at the top level.");
      return;
    }
    const parent = items.find((i) => i.id === item.parentId);
    startTransition(async () => {
      const r = await moveMenuItemAction(menuId, item.id, {
        parentId: parent?.parentId ?? null,
        position: (parent?.position ?? 0) + 1,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onChanged();
    });
  }

  function remove(item: MenuItemDetail) {
    void (async () => {
      const ok = await confirm({
        title: `Delete "${item.label}"?`,
        description: "Removes this item and any nested children.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const r = await deleteMenuItemAction(menuId, item.id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Item removed");
        onChanged();
      });
    })();
  }

  return (
    <ul className="divide-y divide-slate-100">
      {tree.map(({ item, depth }) => (
        <li
          key={item.id}
          className={`flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/50`}
          style={{ paddingLeft: 20 + depth * 24 }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{item.label}</div>
            <div className="truncate text-xs text-slate-500">
              <span className="capitalize">{item.itemType}</span> · <code>{item.url}</code>
              {item.target === "_blank" ? " · new tab" : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton title="Move up" onClick={() => move(item, -1)} disabled={pending}>
              <ChevronUp className="size-3.5" />
            </IconButton>
            <IconButton title="Move down" onClick={() => move(item, 1)} disabled={pending}>
              <ChevronDown className="size-3.5" />
            </IconButton>
            <IconButton title="Indent" onClick={() => indent(item)} disabled={pending}>
              <ChevronRight className="size-3.5" />
            </IconButton>
            <IconButton title="Outdent" onClick={() => outdent(item)} disabled={pending}>
              <ChevronLeft className="size-3.5" />
            </IconButton>
            {/* Mega panel — top-level items only (mega is a top-level
                concept). Footer menus don't offer "Add", but an item with a
                saved panel always keeps the link so the panel stays editable
                and deletable. */}
            {(showMegaAffordance || itemsWithPanels.has(item.id)) && item.parentId === null && (
              <Link
                href={`/admin/menus/${menuId}/items/${item.id}/mega`}
                title={itemsWithPanels.has(item.id) ? "Edit mega panel" : "Add mega panel"}
                aria-label={itemsWithPanels.has(item.id) ? "Edit mega panel" : "Add mega panel"}
                className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 ${
                  itemsWithPanels.has(item.id) ? "text-emerald-600" : ""
                }`}
              >
                <Layers className="size-3.5" />
                {itemsWithPanels.has(item.id) && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white"
                  />
                )}
              </Link>
            )}
            <IconButton title="Edit" onClick={() => onEdit(item)} disabled={pending}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton title="Delete" onClick={() => remove(item)} disabled={pending} danger>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 ${
        danger ? "hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50" : ""
      }`}
    >
      {children}
    </button>
  );
}

function buildFlatWithDepth(items: MenuItemDetail[]): { item: MenuItemDetail; depth: number }[] {
  const byParent = new Map<number | null, MenuItemDetail[]>();
  for (const item of items) {
    const arr = byParent.get(item.parentId) ?? [];
    arr.push(item);
    byParent.set(item.parentId, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);

  const out: { item: MenuItemDetail; depth: number }[] = [];
  function walk(parentId: number | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      out.push({ item: child, depth });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

// ─── Item dialog ────────────────────────────────────────────────────────────

function ItemDialog({
  mode,
  menuId,
  item,
  pickerOptions,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  menuId: number;
  item?: MenuItemDetail;
  pickerOptions: PickerOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemType, setItemType] = useState<UiItemType>(item?.itemType ?? "page");
  const [referenceId, setReferenceId] = useState<number | null>(item?.referenceId ?? null);
  const [label, setLabel] = useState(item?.label ?? "");
  const [url, setUrl] = useState(item?.rawUrl ?? "");
  const [target, setTarget] = useState<MenuItemTarget>(item?.target ?? "_self");
  const [pending, startTransition] = useTransition();

  function pickContent(opts: PickerOption[], id: number) {
    setReferenceId(id);
    if (label.trim().length === 0) {
      const opt = opts.find((o) => o.id === id);
      if (opt) setLabel(opt.label);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Pillar mode is a bulk-add — uses the pillar title as the
    // root label, builds spike children automatically, and skips the
    // free-form label / URL validation the standard add path runs.
    if (itemType === "pillar") {
      if (mode !== "create") {
        toast.error("Pillar mode is only available when adding new items");
        return;
      }
      if (referenceId == null) {
        toast.error("Pick a pillar");
        return;
      }
      const chosen = pickerOptions.pillars.find((p) => p.id === referenceId);
      startTransition(async () => {
        const r = await addPillarWithSpikesAction(menuId, referenceId, { target });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const spikeCount = chosen?.spikes.length ?? 0;
        toast.success(
          spikeCount === 0
            ? "Pillar added"
            : `Pillar + ${spikeCount} ${spikeCount === 1 ? "spike" : "spikes"} added`,
        );
        onSaved();
      });
      return;
    }

    if (label.trim().length === 0) {
      toast.error("Label is required");
      return;
    }
    if (itemType !== "custom" && referenceId == null) {
      toast.error("Pick a content target");
      return;
    }
    if (itemType === "custom" && url.trim().length === 0) {
      toast.error("URL is required for custom items");
      return;
    }
    startTransition(async () => {
      const payload = {
        label: label.trim(),
        itemType: itemType as MenuItemType,
        referenceId: itemType === "custom" ? null : referenceId,
        url: url.trim() || null,
        target,
      };
      if (mode === "create") {
        const r = await addMenuItemAction(menuId, payload);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Item added");
      } else if (item) {
        const r = await updateMenuItemAction(menuId, item.id, payload);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Item updated");
      }
      onSaved();
    });
  }

  const optionsForType: PickerOption[] =
    itemType === "page" ? pickerOptions.pages
    : itemType === "post" ? pickerOptions.posts
    : itemType === "pillar" ? pickerOptions.pillars
    : itemType === "topic" ? pickerOptions.topics
    : [];

  // Pillar mode hides the label / URL fields — the bulk action labels
  // every menu row from the corresponding post title automatically.
  const isPillarMode = itemType === "pillar";

  // Type buttons. Order: Page → Pillar → Post → Topic → Custom URL. The
  // "pillar" pseudo-type only makes sense when adding (it expands into
  // multiple rows on save); edit mode hides it because there's no
  // existing record to convert.
  const TYPES_FOR_MODE: { value: UiItemType; label: string }[] =
    mode === "create"
      ? [
          { value: "page", label: "Page" },
          { value: "pillar", label: "Pillar" },
          { value: "post", label: "Post" },
          { value: "topic", label: "Topic" },
          { value: "custom", label: "Custom URL" },
        ]
      : [
          { value: "page", label: "Page" },
          { value: "post", label: "Post" },
          { value: "topic", label: "Topic" },
          { value: "custom", label: "Custom URL" },
        ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-brand-navy">
          {mode === "create" ? "Add menu item" : "Edit menu item"}
        </h2>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-700">Type</label>
          <div className="flex flex-wrap gap-2">
            {TYPES_FOR_MODE.map(({ value: t, label: typeLabel }) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setItemType(t);
                  setReferenceId(null);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  itemType === t
                    ? "border-brand-green bg-brand-green/10 text-brand-green"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {typeLabel}
              </button>
            ))}
          </div>
        </div>

        {itemType !== "custom" ? (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {isPillarMode ? "Pick pillar (its spikes get added as children)" : `Pick ${itemType}`}
            </label>
            <Select
              value={referenceId == null ? "" : String(referenceId)}
              onValueChange={(v) => {
                if (!v) {
                  setReferenceId(null);
                  return;
                }
                pickContent(optionsForType, Number(v));
              }}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="— Select —">
                  {(v) => {
                    if (!v) return <span className="text-slate-400">— Select —</span>;
                    const opt = optionsForType.find((o) => String(o.id) === v);
                    if (!opt) return <span className="text-slate-400 font-mono">{v}</span>;
                    const spikeCount =
                      isPillarMode
                        ? (opt as PillarPickerOption).spikes?.length ?? 0
                        : 0;
                    return (
                      <>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-slate-400 ml-1 font-mono text-xs">{opt.url}</span>
                        {isPillarMode && spikeCount > 0 ? (
                          <span className="text-slate-400 ml-1 text-xs">
                            · {spikeCount} {spikeCount === 1 ? "spike" : "spikes"}
                          </span>
                        ) : null}
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {optionsForType.map((opt) => {
                  const spikeCount =
                    isPillarMode
                      ? (opt as PillarPickerOption).spikes?.length ?? 0
                      : 0;
                  return (
                    <SelectItem key={opt.id} value={String(opt.id)}>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-slate-400 ml-1 font-mono text-xs">{opt.url}</span>
                      {isPillarMode && spikeCount > 0 ? (
                        <span className="text-slate-400 ml-1 text-xs">
                          · {spikeCount} {spikeCount === 1 ? "spike" : "spikes"}
                        </span>
                      ) : null}
                    </SelectItem>
                  );
                })}
                {optionsForType.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-slate-500">
                    {isPillarMode ? "No published pillars yet." : "Nothing to pick yet."}
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {/* Label / URL fields are irrelevant in pillar mode — the
            bulk-add path pulls labels from each post title and URLs
            from their slugs. */}
        {!isPillarMode ? (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                URL {itemType !== "custom" ? "(optional override)" : ""}
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={itemType === "custom" ? "https://example.com or /about" : ""}
                className={`${inputCls} font-mono`}
              />
            </div>
          </>
        ) : null}

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-700">Target</label>
          <div className="flex gap-2">
            {(["_self", "_blank"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  target === t
                    ? "border-brand-navy bg-brand-navy/5 text-brand-navy"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {t === "_self" ? "Same tab" : "New tab"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-brand-green px-5 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
          >
            {mode === "create" ? "Add" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
