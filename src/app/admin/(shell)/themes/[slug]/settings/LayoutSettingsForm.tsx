"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingRow } from "./_primitives/SettingRow";
import { SettingsCard } from "./_primitives/SettingsCard";
import { PillSelect } from "./_primitives/PillSelect";
import { PillInput } from "./_primitives/PillInput";
// Import directly from the leaf modules — the package's index re-exports
// server-only modules (DB / auth helpers) that must not land in the
// client bundle. Going through the barrel forces Next.js to evaluate
// the whole module graph here, which pulls in `@node-rs/argon2` and
// breaks the public-page bundle.
import {
  COLUMN_PRESETS,
  COLUMN_PRESET_LABELS,
  CONTAINER_WIDTH_MODES,
  CONTAINER_WIDTH_MODE_LABELS,
  CONTAINER_WIDTH_PRESETS,
  CONTAINER_WIDTH_PRESET_LABELS,
  DEFAULT_COLUMN_PRESET,
  DEFAULT_CONTAINER_WIDTH_CUSTOM,
  DEFAULT_CONTAINER_WIDTH_MODE,
  DEFAULT_CONTAINER_WIDTH_PRESET,
  type ColumnPreset,
  type ContainerWidthMode,
  type ContainerWidthPreset,
} from "@core-plugins/themes/layout";
import {
  CLONEABLE_TEMPLATE_IDS,
  TEMPLATE_IDS,
  TEMPLATE_LABELS,
  type CloneableTemplateId,
  type TemplateId,
} from "@core-plugins/themes/templates";
import type {
  CustomTemplateRow as CustomTemplateRowData,
  ThemeListItem,
} from "@core-plugins/themes/service";
import {
  createCustomTemplateAction,
  deleteCustomTemplateAction,
  renameCustomTemplateAction,
  saveThemeSettingAction,
  type ThemeSettingValue,
} from "./actions";
import { ThemeSettingsSaveButton } from "./ThemeSettingsForm";

interface Props {
  theme: ThemeListItem;
  initial: ThemeSettingValue[];
  /** Custom templates grouped by parent template id, fetched server-side. */
  customs: Record<string, CustomTemplateRowData[]>;
  /** When set, the Save button portals into this DOM node — see
   *  ThemeSettingsForm for the same pattern. */
  saveSlotEl?: HTMLElement | null;
}

export function LayoutSettingsForm({ theme, initial, customs, saveSlotEl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const row of initial) out[row.definition.key] = row.value;
    return out;
  });
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [openTemplates, setOpenTemplates] = useState<Set<string>>(() => new Set());

  const [createDialogParent, setCreateDialogParent] = useState<CloneableTemplateId | null>(null);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, startCreateTransition] = useTransition();

  const [renaming, setRenaming] = useState<{ slug: string; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, startRenameTransition] = useTransition();

  const [deleteConfirm, setDeleteConfirm] = useState<{ slug: string; displayName: string } | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const toggleTemplate = (tid: string) => {
    setOpenTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return next;
    });
  };

  // Index by key for direct lookup (no need to re-scan the array).
  const byKey = useMemo(() => {
    const map = new Map<string, ThemeSettingValue>();
    for (const row of initial) map.set(row.definition.key, row);
    return map;
  }, [initial]);

  function get<T>(key: string, fallback: T): T {
    if (key in values) {
      const v = values[key];
      return (v ?? fallback) as T;
    }
    const row = byKey.get(key);
    return (row?.value ?? fallback) as T;
  }

  function update(key: string, value: unknown) {
    if (!byKey.has(key)) return;
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  }

  function save() {
    if (dirty.size === 0) {
      toast("No changes to save");
      return;
    }
    startTransition(async () => {
      const failures: string[] = [];
      for (const key of dirty) {
        const r = await saveThemeSettingAction(theme.slug, key, values[key]);
        if (!r.ok) failures.push(`${key}: ${r.error}`);
      }
      if (failures.length > 0) {
        toast.error(`Save failed: ${failures.join("; ")}`);
        return;
      }
      toast.success("Saved");
      setDirty(new Set());
      router.refresh();
    });
  }

  const slug = theme.slug;

  function openCreateDialog(parentTemplate: CloneableTemplateId) {
    setCreateName("");
    setCreateError(null);
    setCreateDialogParent(parentTemplate);
  }

  function submitCreate() {
    if (!createDialogParent) return;
    const name = createName.trim();
    if (name.length === 0) {
      setCreateError("Name must contain at least one letter or digit.");
      return;
    }
    startCreateTransition(async () => {
      const result = await createCustomTemplateAction(slug, createDialogParent, name);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setCreateDialogParent(null);
      setCreateName("");
      setCreateError(null);
      toast.success("Custom template created");
      router.refresh();
    });
  }

  function openRenameDialog(customSlug: string, currentName: string) {
    setRenameError(null);
    setRenaming({ slug: customSlug, value: currentName });
  }

  function submitRename() {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name.length === 0) {
      setRenameError("Name must contain at least one letter or digit.");
      return;
    }
    startRenameTransition(async () => {
      const result = await renameCustomTemplateAction(slug, renaming.slug, name);
      if (!result.ok) {
        setRenameError(result.error);
        return;
      }
      setRenaming(null);
      setRenameError(null);
      toast.success("Custom template renamed");
      router.refresh();
    });
  }

  function submitDelete(customSlug: string) {
    startDeleteTransition(async () => {
      const result = await deleteCustomTemplateAction(slug, customSlug);
      if (!result.ok) {
        toast.error(result.error);
        setDeleteConfirm(null);
        return;
      }
      setDeleteConfirm(null);
      toast.success("Custom template deleted");
      router.refresh();
    });
  }

  const containerModeKey = `theme.${slug}.container_width_mode`;
  const containerPresetKey = `theme.${slug}.container_width_preset`;
  const containerCustomKey = `theme.${slug}.container_width_custom`;
  const applyHeaderKey = `theme.${slug}.container_apply_to_header`;
  const applyFooterKey = `theme.${slug}.container_apply_to_footer`;

  const containerMode = get<ContainerWidthMode>(
    containerModeKey,
    DEFAULT_CONTAINER_WIDTH_MODE,
  );
  const containerPreset = get<ContainerWidthPreset>(
    containerPresetKey,
    DEFAULT_CONTAINER_WIDTH_PRESET,
  );
  const containerCustom = get<string>(containerCustomKey, DEFAULT_CONTAINER_WIDTH_CUSTOM);
  const applyToHeader = get<boolean>(applyHeaderKey, true);
  const applyToFooter = get<boolean>(applyFooterKey, true);

  const hasContainerSettings = byKey.has(containerModeKey);

  const saveButton = (
    <ThemeSettingsSaveButton onSave={save} pending={pending} dirty={dirty.size} />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {saveSlotEl ? createPortal(saveButton, saveSlotEl) : null}

      {hasContainerSettings ? (
        <SettingsCard title="Container width">
          <SettingRow
            label="Mode"
            description="Constrain the overall website container."
            htmlFor="container-mode"
            control={
              <PillSelect
                id="container-mode"
                value={containerMode}
                options={CONTAINER_WIDTH_MODES.map((m) => ({
                  value: m,
                  label: CONTAINER_WIDTH_MODE_LABELS[m],
                }))}
                onValueChange={(v) => update(containerModeKey, v as ContainerWidthMode)}
              />
            }
          />
          {containerMode === "preset" ? (
            <SettingRow
              label="Tailwind preset"
              htmlFor="container-preset"
              control={
                <PillSelect
                  id="container-preset"
                  value={containerPreset}
                  options={CONTAINER_WIDTH_PRESETS.map((p) => ({
                    value: p,
                    label: CONTAINER_WIDTH_PRESET_LABELS[p],
                  }))}
                  onValueChange={(v) => update(containerPresetKey, v as ContainerWidthPreset)}
                  minWidth="min-w-[12rem]"
                />
              }
            />
          ) : null}
          {containerMode === "custom" ? (
            <SettingRow
              label="Custom width"
              description={
                <>
                  Any CSS length value. Uses inline <code>max-width</code>.
                </>
              }
              htmlFor="container-custom"
              control={
                <PillInput
                  id="container-custom"
                  type="text"
                  value={containerCustom}
                  onChange={(v) => update(containerCustomKey, v)}
                  placeholder="e.g. 1280px"
                  width="w-44"
                />
              }
            />
          ) : null}
          <SettingRow
            label="Apply to header"
            description="Off keeps the header full-width."
            htmlFor="container-apply-header"
            control={
              <Switch
                id="container-apply-header"
                checked={applyToHeader}
                onCheckedChange={(v) => update(applyHeaderKey, v)}
              />
            }
          />
          <SettingRow
            label="Apply to footer"
            description="Off keeps the footer full-width."
            htmlFor="container-apply-footer"
            control={
              <Switch
                id="container-apply-footer"
                checked={applyToFooter}
                onCheckedChange={(v) => update(applyFooterKey, v)}
              />
            }
          />
        </SettingsCard>
      ) : null}

      <SettingsCard
        title="Per-template layout"
        span={!hasContainerSettings ? "full" : "single"}
      >
        <p className="-mt-1 mb-2 text-xs text-slate-400">
          Each template has its own column ratio, sidebar visibility, and main-zone behavior.
        </p>
        {TEMPLATE_IDS.map((tid) => {
          const isCloneable = (CLONEABLE_TEMPLATE_IDS as readonly string[]).includes(tid);
          const customRows = isCloneable ? (customs[tid] ?? []) : [];
          return (
            <div key={tid}>
              <TemplateRow
                tid={tid}
                slug={slug}
                get={get}
                update={update}
                byKey={byKey}
                open={openTemplates.has(tid)}
                onToggle={() => toggleTemplate(tid)}
                rightAction={
                  isCloneable ? (
                    <button
                      type="button"
                      aria-label={`Create custom template based on ${TEMPLATE_LABELS[tid]}`}
                      title={`Create a copy of ${TEMPLATE_LABELS[tid]}`}
                      onClick={(e) => { e.stopPropagation(); openCreateDialog(tid as CloneableTemplateId); }}
                      className="ml-2 flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    /* Same-size placeholder so chips/chevrons line up across cloneable + non-cloneable rows. */
                    <div className="ml-2 h-7 w-7 shrink-0" aria-hidden="true" />
                  )
                }
              />

              {customRows.map((custom) => (
                <CustomTemplateRow
                  key={custom.slug}
                  custom={custom}
                  slug={slug}
                  get={get}
                  update={update}
                  byKey={byKey}
                  open={openTemplates.has(custom.slug)}
                  onToggle={() => toggleTemplate(custom.slug)}
                  onRename={() => openRenameDialog(custom.slug, custom.displayName)}
                  onDelete={() => setDeleteConfirm({ slug: custom.slug, displayName: custom.displayName })}
                />
              ))}
            </div>
          );
        })}
      </SettingsCard>

      {/* Create custom template dialog */}
      <Dialog
        open={createDialogParent !== null}
        onOpenChange={(open) => { if (!open) setCreateDialogParent(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createDialogParent
                ? `Create custom ${TEMPLATE_LABELS[createDialogParent]}`
                : "Create custom template"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label
              className="mb-1 block text-sm font-medium text-slate-700"
              htmlFor="create-template-name"
            >
              Display name
            </label>
            <input
              id="create-template-name"
              type="text"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(null); }}
              placeholder="e.g. Product Page"
              onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
            <p className="mt-1 text-xs text-slate-500">
              We&apos;ll copy the parent template&apos;s content and settings as a starting point.
            </p>
            {createError ? (
              <p className="mt-1 text-sm text-red-600">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateDialogParent(null)}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCreate}
              disabled={createPending || createName.trim().length === 0}
              className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createPending ? "Creating…" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename custom template dialog */}
      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => { if (!open) { setRenaming(null); setRenameError(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename custom template</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label
              className="mb-1 block text-sm font-medium text-slate-700"
              htmlFor="rename-template-name"
            >
              Display name
            </label>
            <input
              id="rename-template-name"
              type="text"
              value={renaming?.value ?? ""}
              onChange={(e) => {
                setRenameError(null);
                setRenaming((prev) => prev ? { ...prev, value: e.target.value } : null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
            <p className="mt-1 text-xs text-slate-500">
              The URL slug stays the same — only the label shown in this list and the builder changes.
            </p>
            {renameError ? (
              <p className="mt-1 text-sm text-red-600">{renameError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => { setRenaming(null); setRenameError(null); }}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitRename}
              disabled={renamePending || (renaming?.value.trim().length ?? 0) === 0}
              className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {renamePending ? "Renaming…" : "Rename"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;{deleteConfirm?.displayName}&rdquo;?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Settings for this template will be removed. Built-in templates are
            not affected. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteConfirm(null)}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteConfirm && submitDelete(deleteConfirm.slug)}
              disabled={deletePending}
              className="h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateRow({
  tid,
  slug,
  get,
  update,
  byKey,
  open,
  onToggle,
  rightAction,
}: {
  tid: TemplateId;
  slug: string;
  get: <T>(key: string, fallback: T) => T;
  update: (key: string, value: unknown) => void;
  byKey: Map<string, ThemeSettingValue>;
  open: boolean;
  onToggle: () => void;
  rightAction?: React.ReactNode;
}) {
  const presetKey = `theme.${slug}.template.${tid}.column_preset`;
  const expandKey = `theme.${slug}.template.${tid}.expand_main_when_no_sidebars`;
  const showLeftKey = `theme.${slug}.template.${tid}.show_left_sidebar`;
  const showRightKey = `theme.${slug}.template.${tid}.show_right_sidebar`;
  const customLeftKey = `theme.${slug}.template.${tid}.custom_left_sidebar`;
  const customRightKey = `theme.${slug}.template.${tid}.custom_right_sidebar`;

  const preset = get<ColumnPreset>(presetKey, DEFAULT_COLUMN_PRESET);
  const expand = get<boolean>(expandKey, true);
  const showLeft = get<boolean>(showLeftKey, true);
  const showRight = get<boolean>(showRightKey, true);
  // Per-template sidebar override flags. Toggled from the theme builder
  // (not this form). Surfaced here so the L/R chips can shade amber
  // when a template is showing a sidebar that diverges from the shared
  // default. Default false → green when on (uses shared sidebar).
  const customLeft = get<boolean>(customLeftKey, false);
  const customRight = get<boolean>(customRightKey, false);

  const hasPresetSetting = byKey.has(presetKey);
  const hasExpandSetting = byKey.has(expandKey);

  const presetAbbrev = COLUMN_PRESET_ABBREV[preset];
  const bodyId = `tpl-body-${tid}`;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex flex-1 items-center justify-between gap-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30 rounded"
        >
          <span className="text-sm font-medium text-slate-700">
            {TEMPLATE_LABELS[tid]}
          </span>
          <span className="flex items-center gap-1.5">
            {hasPresetSetting ? <Chip>{presetAbbrev}</Chip> : null}
            <SidebarChip side="L" on={showLeft} custom={customLeft} />
            <SidebarChip side="R" on={showRight} custom={customRight} />
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>
        {rightAction}
      </div>
      {open ? (
        <div id={bodyId} className="mb-2 rounded-md bg-slate-50/60 px-3 py-2">
          {hasPresetSetting ? (
            <SettingRow
              label="Column preset"
              htmlFor={`tpl-preset-${tid}`}
              control={
                <PillSelect
                  id={`tpl-preset-${tid}`}
                  value={preset}
                  options={COLUMN_PRESETS.map((p) => ({
                    value: p,
                    label: COLUMN_PRESET_LABELS[p],
                  }))}
                  onValueChange={(v) => update(presetKey, v as ColumnPreset)}
                  minWidth="min-w-[10rem]"
                />
              }
            />
          ) : null}
          <SettingRow
            label="Show left sidebar"
            htmlFor={`tpl-left-${tid}`}
            control={
              <Switch
                id={`tpl-left-${tid}`}
                checked={showLeft}
                onCheckedChange={(v) => update(showLeftKey, v)}
              />
            }
          />
          <SettingRow
            label="Show right sidebar"
            htmlFor={`tpl-right-${tid}`}
            control={
              <Switch
                id={`tpl-right-${tid}`}
                checked={showRight}
                onCheckedChange={(v) => update(showRightKey, v)}
              />
            }
          />
          {hasExpandSetting ? (
            <SettingRow
              label="Expand main when sidebars are off"
              description="If both sidebars are hidden, stretch main to 100%."
              htmlFor={`tpl-expand-${tid}`}
              control={
                <Switch
                  id={`tpl-expand-${tid}`}
                  checked={expand}
                  onCheckedChange={(v) => update(expandKey, v)}
                />
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-500">
      {children}
    </span>
  );
}

function SidebarChip({
  side,
  on,
  custom,
}: {
  side: "L" | "R";
  on: boolean;
  /** True when this template has its own per-template sidebar override
   *  enabled (set from the theme builder). Off → uses the shared
   *  default sidebar. Drives the amber tint so it's obvious at a
   *  glance which templates diverge from the shared layout. */
  custom?: boolean;
}) {
  const sideLabel = side === "L" ? "Left" : "Right";
  const className = !on
    ? "inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-400"
    : custom
      ? "inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-700"
      : "inline-flex h-6 w-6 items-center justify-center rounded-full border border-green-200 bg-green-50 text-[11px] font-semibold text-green-700";
  const title = !on
    ? `${sideLabel} sidebar off`
    : custom
      ? `${sideLabel} sidebar on — custom (per-template override)`
      : `${sideLabel} sidebar on — shared default`;
  return (
    <span className={className} aria-label={title} title={title}>
      {side}
    </span>
  );
}

const COLUMN_PRESET_ABBREV: Record<ColumnPreset, string> = {
  "1/4-1/2-1/4": "1/4·1/2·1/4",
  "1/3-1/3-1/3": "1/3·1/3·1/3",
};

function CustomTemplateRow({
  custom,
  slug,
  get,
  update,
  byKey,
  open,
  onToggle,
  onRename,
  onDelete,
}: {
  custom: CustomTemplateRowData;
  slug: string;
  get: <T>(key: string, fallback: T) => T;
  update: (key: string, value: unknown) => void;
  byKey: Map<string, ThemeSettingValue>;
  open: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const parentId = custom.parentTemplate;
  const presetKey = `theme.${slug}.template.${custom.slug}.column_preset`;
  const expandKey = `theme.${slug}.template.${custom.slug}.expand_main_when_no_sidebars`;
  const showLeftKey = `theme.${slug}.template.${custom.slug}.show_left_sidebar`;
  const showRightKey = `theme.${slug}.template.${custom.slug}.show_right_sidebar`;

  // Custom rows live alongside built-ins in the same setting keyspace. Their
  // registered defaults come from the parent template, so fall back to the
  // parent's keys for initial display until the custom is saved.
  const parentPresetKey = `theme.${slug}.template.${parentId}.column_preset`;
  const parentExpandKey = `theme.${slug}.template.${parentId}.expand_main_when_no_sidebars`;
  const parentShowLeftKey = `theme.${slug}.template.${parentId}.show_left_sidebar`;
  const parentShowRightKey = `theme.${slug}.template.${parentId}.show_right_sidebar`;

  const preset = get<ColumnPreset>(
    presetKey,
    get<ColumnPreset>(parentPresetKey, DEFAULT_COLUMN_PRESET),
  );
  const expand = get<boolean>(expandKey, get<boolean>(parentExpandKey, true));
  const showLeft = get<boolean>(showLeftKey, get<boolean>(parentShowLeftKey, true));
  const showRight = get<boolean>(showRightKey, get<boolean>(parentShowRightKey, true));

  const hasPresetSetting = byKey.has(presetKey) || byKey.has(parentPresetKey);
  const hasExpandSetting = byKey.has(expandKey) || byKey.has(parentExpandKey);

  const presetAbbrev = COLUMN_PRESET_ABBREV[preset];
  const bodyId = `tpl-body-custom-${custom.slug}`;

  return (
    <div className="border-l border-slate-200 pl-6">
      <div className="flex items-center gap-1 border-b border-slate-100">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex flex-1 items-center justify-between gap-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30 rounded"
        >
          <span className="text-sm font-medium text-slate-600">{custom.displayName}</span>
          <span className="flex items-center gap-1.5">
            <Chip>Custom</Chip>
            {hasPresetSetting ? <Chip>{presetAbbrev}</Chip> : null}
            <SidebarChip side="L" on={showLeft} />
            <SidebarChip side="R" on={showRight} />
            <ChevronDown
              className={`size-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>
        <button
          type="button"
          aria-label={`Rename ${custom.displayName}`}
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-600"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${custom.displayName}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-600"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div id={bodyId} className="mb-2 rounded-md bg-slate-50/60 px-3 py-2">
          {hasPresetSetting ? (
            <SettingRow
              label="Column preset"
              htmlFor={`tpl-preset-${custom.slug}`}
              control={
                <PillSelect
                  id={`tpl-preset-${custom.slug}`}
                  value={preset}
                  options={COLUMN_PRESETS.map((p) => ({ value: p, label: COLUMN_PRESET_LABELS[p] }))}
                  onValueChange={(v) => update(presetKey, v as ColumnPreset)}
                  minWidth="min-w-[10rem]"
                />
              }
            />
          ) : null}
          <SettingRow
            label="Show left sidebar"
            htmlFor={`tpl-left-${custom.slug}`}
            control={
              <Switch
                id={`tpl-left-${custom.slug}`}
                checked={showLeft}
                onCheckedChange={(v) => update(showLeftKey, v)}
              />
            }
          />
          <SettingRow
            label="Show right sidebar"
            htmlFor={`tpl-right-${custom.slug}`}
            control={
              <Switch
                id={`tpl-right-${custom.slug}`}
                checked={showRight}
                onCheckedChange={(v) => update(showRightKey, v)}
              />
            }
          />
          {hasExpandSetting ? (
            <SettingRow
              label="Expand main when sidebars are off"
              description="If both sidebars are hidden, stretch main to 100%."
              htmlFor={`tpl-expand-${custom.slug}`}
              control={
                <Switch
                  id={`tpl-expand-${custom.slug}`}
                  checked={expand}
                  onCheckedChange={(v) => update(expandKey, v)}
                />
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

