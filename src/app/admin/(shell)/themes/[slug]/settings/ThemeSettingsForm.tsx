"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { MediaPickerInput } from "@core/components/MediaPicker";
import type { ThemeListItem } from "@core-plugins/themes/service";
import { saveThemeSettingAction, type ThemeSettingValue } from "./actions";
import { SectionLabel } from "./_primitives/SectionLabel";
import { SettingRow } from "./_primitives/SettingRow";
import { SettingsCard } from "./_primitives/SettingsCard";
import { PillSelect } from "./_primitives/PillSelect";
import { PillInput } from "./_primitives/PillInput";
import { ColorPill, GRAY_PRESETS } from "@core/components/ColorPill";

interface Props {
  theme: ThemeListItem;
  initial: ThemeSettingValue[];
  saveSlotEl?: HTMLElement | null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ThemeSettingsForm({ theme, initial, saveSlotEl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const row of initial) out[row.definition.key] = row.value;
    return out;
  });
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => {
    const map = new Map<string, ThemeSettingValue[]>();
    for (const row of initial) {
      const arr = map.get(row.definition.group) ?? [];
      arr.push(row);
      map.set(row.definition.group, arr);
    }
    return Array.from(map.entries());
  }, [initial]);

  const brandPresets = useMemo(() => {
    const out: { label: string; value: string; key: string }[] = [];
    for (const row of initial) {
      const key = row.definition.key;
      if (!key.startsWith(`theme.${theme.slug}.brand_`)) continue;
      const v = values[key];
      if (typeof v !== "string" || !HEX_RE.test(v)) continue;
      const tail = key.slice(`theme.${theme.slug}.brand_`.length);
      out.push({ key, value: v, label: prettyTail(tail) });
    }
    return out;
  }, [initial, values, theme.slug]);

  function setValue(key: string, value: unknown) {
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

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
        This theme has no Style/UI settings registered.
      </div>
    );
  }

  const saveButton = (
    <SaveButton onSave={save} pending={pending} dirty={dirty.size} />
  );

  const brandGroups = groups.filter(([groupName]) =>
    groupTail(groupName, theme.slug).startsWith("brand"),
  );
  const chromeGroups = groups.filter(
    ([groupName]) => !groupTail(groupName, theme.slug).startsWith("brand"),
  );

  const onlyBrand = chromeGroups.length === 0;
  const onlyChrome = brandGroups.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {saveSlotEl ? createPortal(saveButton, saveSlotEl) : null}
      {brandGroups.length > 0 ? (
        <SettingsCard
          title="Brand identity"
          span={onlyBrand ? "full" : "single"}
        >
          {brandGroups.flatMap(([, rows]) =>
            rows.map((row) => (
              <SettingFieldRow
                key={row.definition.key}
                row={row}
                value={values[row.definition.key]}
                onChange={(v) => setValue(row.definition.key, v)}
                brandPresets={brandPresets}
              />
            )),
          )}
        </SettingsCard>
      ) : null}
      {chromeGroups.length > 0 ? (
        <SettingsCard
          title="Site styling"
          span={onlyChrome ? "full" : "single"}
        >
          {chromeGroups.map(([groupName, rows]) => (
            <section key={groupName}>
              <SectionLabel>{prettyGroup(groupName, theme.slug)}</SectionLabel>
              {rows.map((row) => (
                <SettingFieldRow
                  key={row.definition.key}
                  row={row}
                  value={values[row.definition.key]}
                  onChange={(v) => setValue(row.definition.key, v)}
                  brandPresets={brandPresets}
                />
              ))}
            </section>
          ))}
        </SettingsCard>
      ) : null}
    </div>
  );
}

function prettyTail(tail: string): string {
  return tail.charAt(0).toUpperCase() + tail.slice(1).replace(/[._-]/g, " ");
}

function prettyGroup(group: string, slug: string): string {
  const tail = group.replace(`theme.${slug}.`, "");
  if (!tail) return group;
  return prettyTail(tail);
}

function groupTail(group: string, slug: string): string {
  return group.replace(`theme.${slug}.`, "");
}

type FieldKind =
  | "media"
  | "favicon"
  | "color"
  | "boolean"
  | "select"
  | "textarea"
  | "number"
  | "text";

function classifyField(row: ThemeSettingValue): FieldKind {
  const key = row.definition.key;
  if (/(?:^|[._])favicon(?:[_.]data)?$/.test(key)) return "favicon";
  if (key.endsWith("_media_id") || key.endsWith("_media_url")) return "media";
  if (key.endsWith("_color") || /(?:^|\.)brand_/.test(key)) return "color";
  if (row.definition.enumOptions && row.definition.enumOptions.length > 0) {
    return "select";
  }
  const dv = row.definition.defaultValue;
  if (typeof dv === "boolean") return "boolean";
  if (typeof dv === "number") return "number";
  if (key.endsWith("_css") || key.endsWith("_html")) return "textarea";
  return "text";
}

function SettingFieldRow({
  row,
  value,
  onChange,
  brandPresets,
}: {
  row: ThemeSettingValue;
  value: unknown;
  onChange: (next: unknown) => void;
  brandPresets: { label: string; value: string; key: string }[];
}) {
  const kind = classifyField(row);
  const id = fieldId(row.definition.key);
  const label = row.definition.label;
  const description = row.definition.description ?? undefined;

  let control: React.ReactNode = null;
  switch (kind) {
    case "media":
      control = (
        <LogoField
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
        />
      );
      break;
    case "favicon":
      control = (
        <FaviconField
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
        />
      );
      break;
    case "color":
      control = (
        <ColorPill
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
          brandPresets={brandPresets.filter((p) => p.key !== row.definition.key)}
          grayPresets={[...GRAY_PRESETS]}
        />
      );
      break;
    case "boolean":
      control = (
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      );
      break;
    case "select":
      control = (
        <PillSelect
          id={id}
          value={typeof value === "string" ? value : String(row.definition.defaultValue ?? "")}
          options={(row.definition.enumOptions ?? []).map((o) => ({ value: o.value, label: o.label }))}
          onValueChange={(v) => onChange(v)}
        />
      );
      break;
    case "number":
      control = (
        <PillInput
          id={id}
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(v) => onChange(Number(v))}
          width="w-28"
        />
      );
      break;
    case "textarea":
      // Style/UI settings never include `_css` keys (filtered out by
      // ThemeSettingsClient — they land on the Custom CSS tab). Leave
      // this branch as a defensive fall-through to PillInput so a
      // misregistered key doesn't crash the page.
    case "text":
    default:
      control = (
        <PillInput
          id={id}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
        />
      );
      break;
  }

  return (
    <SettingRow
      label={label}
      description={description}
      htmlFor={id}
      control={control}
    />
  );
}

function fieldId(key: string): string {
  return `setting-${key.replace(/\./g, "-")}`;
}

function FaviconField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const MAX_BYTES = 256 * 1024;
  const hasValue = value.length > 0;
  const looksValid =
    hasValue &&
    /^data:image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,/.test(value);

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`File too large (${Math.ceil(file.size / 1024)} KB). Max 256 KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        toast.error("Couldn't read file");
        return;
      }
      let dataUrl = result;
      if (!/^data:image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,/.test(dataUrl)) {
        const lower = file.name.toLowerCase();
        const mime = lower.endsWith(".ico")
          ? "x-icon"
          : lower.endsWith(".svg")
            ? "svg+xml"
            : "png";
        const base64 = dataUrl.split(",")[1] ?? "";
        dataUrl = `data:image/${mime};base64,${base64}`;
      }
      onChange(dataUrl);
    };
    reader.onerror = () => toast.error("Couldn't read file");
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.png,.ico,.svg"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {looksValid ? (
        // Inline mini-preview so users see what's currently set
        // without opening a popover.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="size-6 shrink-0 rounded-sm border border-slate-200 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Upload className="size-3.5" />
        {hasValue ? "Replace" : "Upload"}
      </button>
      {hasValue ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs text-slate-500 hover:bg-slate-50"
          title="Clear favicon"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function LogoField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <MediaPickerInput
      id={id}
      value={value}
      onChange={onChange}
      allowUpload
      variant="natural"
    />
  );
}

function SaveButton({
  onSave,
  pending,
  dirty,
}: {
  onSave: () => void;
  pending: boolean;
  dirty: number;
}) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={pending || dirty === 0}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-green px-4 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
    >
      <Save className="size-4" />
      {pending ? "Saving…" : dirty > 0 ? `Save (${dirty})` : "Save"}
    </button>
  );
}

export { SaveButton as ThemeSettingsSaveButton };
