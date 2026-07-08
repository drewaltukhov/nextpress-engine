"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { css as cssLang } from "@codemirror/lang-css";
import type { ThemeListItem } from "@core-plugins/themes/service";
import { saveThemeSettingAction, type ThemeSettingValue } from "./actions";
import { ThemeSettingsSaveButton } from "./ThemeSettingsForm";

interface Props {
  theme: ThemeListItem;
  initial: ThemeSettingValue[];
  /** When set, the Save button portals into this DOM node — see
   *  ThemeSettingsForm for the same pattern. */
  saveSlotEl?: HTMLElement | null;
}

// Keys for the three breakpoint-scoped overrides, in tab order. The route
// `/api/themes/<slug>/user-overrides.css` knows the same triple and
// concatenates them with the matching @media wrappers.
const BREAKPOINT_SUFFIXES = ["user_overrides_css", "user_overrides_css_tablet", "user_overrides_css_mobile"] as const;
type BreakpointSuffix = (typeof BREAKPOINT_SUFFIXES)[number];

const BREAKPOINT_TABS: { suffix: BreakpointSuffix; label: string; hint: string }[] = [
  { suffix: "user_overrides_css", label: "Desktop", hint: "Base styles — applied at every breakpoint." },
  { suffix: "user_overrides_css_tablet", label: "Tablet", hint: "Overrides for screens ≤1023px (wrapped in @media)." },
  { suffix: "user_overrides_css_mobile", label: "Mobile", hint: "Overrides for screens ≤767px (wrapped in @media)." },
];

function keySuffix(key: string): string {
  // Setting keys are `theme.<slug>.<suffix>`; we identify breakpoints by
  // suffix so the form doesn't need to know the active theme's slug.
  const lastDot = key.lastIndexOf(".");
  return lastDot === -1 ? key : key.slice(lastDot + 1);
}

export function CustomCssForm({ theme, initial, saveSlotEl }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const row of initial) {
      out[row.definition.key] = typeof row.value === "string" ? row.value : "";
    }
    return out;
  });
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  function setValue(key: string, value: string) {
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

  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
        This theme has no custom CSS settings registered.
      </div>
    );
  }

  // Bucket the breakpoint trio into one tabbed card; any other `*_css`
  // settings a theme might register fall through to standalone cards.
  const breakpointRows = new Map<BreakpointSuffix, ThemeSettingValue>();
  const otherRows: ThemeSettingValue[] = [];
  for (const row of initial) {
    const suffix = keySuffix(row.definition.key) as BreakpointSuffix;
    if ((BREAKPOINT_SUFFIXES as readonly string[]).includes(suffix)) {
      breakpointRows.set(suffix, row);
    } else {
      otherRows.push(row);
    }
  }
  const hasBreakpointCard = breakpointRows.size > 0;
  const singleSection = hasBreakpointCard && otherRows.length === 0;

  const saveButton = (
    <ThemeSettingsSaveButton onSave={save} pending={pending} dirty={dirty.size} />
  );

  return (
    <div className="flex flex-col gap-3">
      {saveSlotEl ? createPortal(saveButton, saveSlotEl) : null}

      <p className="text-xs text-slate-500">
        Appended to every public page when this theme is active. Saved
        changes propagate after the page revalidates — refresh the
        frontend if you don&apos;t see them right away.
      </p>

      <div className="space-y-4">
        {hasBreakpointCard ? (
          <BreakpointCssCard
            rows={breakpointRows}
            values={values}
            dirty={dirty}
            onChange={setValue}
            single={singleSection}
          />
        ) : null}

        {otherRows.map((row) => (
          <CssEditorCard
            key={row.definition.key}
            label={row.definition.label}
            description={row.definition.description}
            value={values[row.definition.key] ?? ""}
            onChange={(v) => setValue(row.definition.key, v)}
            single={!hasBreakpointCard && otherRows.length === 1}
          />
        ))}
      </div>
    </div>
  );
}

function BreakpointCssCard({
  rows,
  values,
  dirty,
  onChange,
  single,
}: {
  rows: Map<BreakpointSuffix, ThemeSettingValue>;
  values: Record<string, string>;
  dirty: Set<string>;
  onChange: (key: string, value: string) => void;
  single: boolean;
}) {
  const availableTabs = BREAKPOINT_TABS.filter((t) => rows.has(t.suffix));
  const [activeSuffix, setActiveSuffix] = useState<BreakpointSuffix>(
    availableTabs[0]?.suffix ?? "user_overrides_css",
  );
  const activeRow = rows.get(activeSuffix);
  const activeHint = availableTabs.find((t) => t.suffix === activeSuffix)?.hint;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-5 pt-3">
        <h2 className="text-sm font-semibold text-slate-900">Custom CSS</h2>
        {activeHint ? (
          <p className="mt-0.5 text-xs text-slate-500">{activeHint}</p>
        ) : null}
        <div
          className="-mb-px mt-2 flex gap-1"
          role="tablist"
          aria-label="Custom CSS breakpoint"
        >
          {availableTabs.map((tab) => {
            const row = rows.get(tab.suffix);
            if (!row) return null;
            const isActive = tab.suffix === activeSuffix;
            const isDirty = dirty.has(row.definition.key);
            return (
              <button
                key={tab.suffix}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSuffix(tab.suffix)}
                className={
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors " +
                  (isActive
                    ? "border-brand-green text-brand-navy"
                    : "border-transparent text-slate-500 hover:text-brand-navy")
                }
              >
                {tab.label}
                {isDirty ? (
                  <span
                    aria-label="unsaved changes"
                    className="size-1.5 rounded-full bg-brand-green"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </header>
      {/* Each tab swaps its own CodeMirror instance; mounting per-tab
          (keyed by suffix) means each editor preserves its own undo
          stack and CodeMirror doesn't have to reconcile a value swap. */}
      <div className={single ? "h-[calc(100vh-300px)] min-h-[420px]" : "min-h-[420px]"}>
        {activeRow ? (
          <CodeMirror
            key={activeRow.definition.key}
            value={values[activeRow.definition.key] ?? ""}
            onChange={(v) => onChange(activeRow.definition.key, v)}
            extensions={[cssLang()]}
            placeholder="/* CSS */"
            height="100%"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              tabSize: 2,
            }}
            className="h-full text-sm"
          />
        ) : null}
      </div>
    </section>
  );
}

function CssEditorCard({
  label,
  description,
  value,
  onChange,
  single,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (next: string) => void;
  single: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        ) : null}
      </header>
      {/* When there's exactly one editor (the typical case) it fills as
          much height as the viewport allows; for multiple editors we
          fall back to a tall fixed minimum so they stack readably. */}
      <div className={single ? "h-[calc(100vh-260px)] min-h-[420px]" : "min-h-[420px]"}>
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={[cssLang()]}
          placeholder="/* CSS */"
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            tabSize: 2,
          }}
          className="h-full text-sm"
        />
      </div>
    </section>
  );
}
