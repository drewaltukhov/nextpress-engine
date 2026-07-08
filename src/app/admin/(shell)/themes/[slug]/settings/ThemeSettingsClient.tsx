"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, Code, Layout, Palette } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
// Type-only import from the barrel is fine (erased at compile time),
// but going through `@core-plugins/themes/service` mirrors the other
// client components in this folder and avoids surprising future edits
// that change `import type` to `import` from accidentally pulling
// server-only code into the client bundle.
import type { CustomTemplateRow, ThemeListItem } from "@core-plugins/themes/service";
import { ThemeSettingsForm } from "./ThemeSettingsForm";
import { LayoutSettingsForm } from "./LayoutSettingsForm";
import { CustomCssForm } from "./CustomCssForm";
import { BackupRestoreCard } from "./BackupRestoreCard";
import type { ThemeSettingValue } from "./actions";

interface Props {
  theme: ThemeListItem;
  initial: ThemeSettingValue[];
  customs: Record<string, CustomTemplateRow[]>;
  defaultTab?: string;
}

const TABS = ["style", "layout", "custom-css", "backup"] as const;
type ThemeTab = (typeof TABS)[number];

function isLayoutGroup(group: string, slug: string): boolean {
  return group === `theme.${slug}.layout` || group === `theme.${slug}.container`;
}

// CSS-bearing settings (anything whose key contains `_css` as the last
// segment, optionally followed by a breakpoint suffix like
// `_css_tablet`) live in the dedicated Custom CSS tab. Splitting by
// key suffix keeps the contract open — themes can register additional
// `*_css` settings (e.g. an editor.css override) and they'll
// automatically land here.
function isCssKey(key: string): boolean {
  return /(^|_)css(_[a-z]+)?$/.test(key);
}

export function ThemeSettingsClient({ theme, initial, customs, defaultTab }: Props) {
  const styleSettings = initial.filter(
    (row) =>
      !isLayoutGroup(row.definition.group, theme.slug) &&
      !isCssKey(row.definition.key),
  );
  const layoutSettings = initial.filter((row) =>
    isLayoutGroup(row.definition.group, theme.slug),
  );
  const cssSettings = initial.filter((row) => isCssKey(row.definition.key));

  const tab: ThemeTab =
    defaultTab && (TABS as readonly string[]).includes(defaultTab)
      ? (defaultTab as ThemeTab)
      : "style";

  // Each tab with a Save button gets a slot on the tab strip's right
  // side via AdminSection's `tabsAction`. The forms below portal their
  // Save buttons into these slots, so the buttons share a row with the
  // tabs (no separate header row above the form). Backup/Restore has
  // no global Save — its Export/Import buttons live inline in the
  // card.
  const [styleSlotEl, setStyleSlotEl] = useState<HTMLSpanElement | null>(null);
  const [layoutSlotEl, setLayoutSlotEl] = useState<HTMLSpanElement | null>(null);
  const [cssSlotEl, setCssSlotEl] = useState<HTMLSpanElement | null>(null);

  return (
    <div>
      {/* Header mirrors the builder page (ThemeBuilderClient.tsx) so the
          two per-theme pages feel like sibling views rather than separate
          designs. Title is rendered here instead of via AdminSection's
          title prop, which keeps AdminSection's larger 4xl style intact
          for the other consumers (Settings, Security). */}
      <div className="mb-3">
        <Link
          href="/admin/themes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-green"
        >
          <ArrowLeft className="size-3" />
          Back to Themes
        </Link>
        <h1 className="font-display text-3xl tracking-tight text-brand-navy">
          {theme.name}{" "}
          <span className="text-base font-normal text-slate-500">— Settings</span>
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          v{theme.version}
          {theme.author ? <> · {theme.author}</> : null}
        </p>
      </div>

      <AdminSection
        defaultTab={tab}
        tabs={[
          {
            value: "style",
            label: "Style/UI",
            icon: <Palette className="size-4" />,
            tabsAction: <span ref={setStyleSlotEl} />,
            content: (
              <ThemeSettingsForm
                theme={theme}
                initial={styleSettings}
                saveSlotEl={styleSlotEl}
              />
            ),
          },
          {
            value: "layout",
            label: "Layout",
            icon: <Layout className="size-4" />,
            tabsAction: <span ref={setLayoutSlotEl} />,
            content: (
              <LayoutSettingsForm
                theme={theme}
                initial={layoutSettings}
                customs={customs}
                saveSlotEl={layoutSlotEl}
              />
            ),
          },
          {
            value: "custom-css",
            label: "Custom CSS",
            icon: <Code className="size-4" />,
            tabsAction: <span ref={setCssSlotEl} />,
            content: (
              <CustomCssForm
                theme={theme}
                initial={cssSettings}
                saveSlotEl={cssSlotEl}
              />
            ),
          },
          {
            value: "backup",
            label: "Backup/Restore",
            icon: <Archive className="size-4" />,
            content: <BackupRestoreCard theme={theme} />,
          },
        ]}
      />
    </div>
  );
}
