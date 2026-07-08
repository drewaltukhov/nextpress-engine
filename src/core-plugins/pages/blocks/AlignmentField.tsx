import type { CustomField } from "@measured/puck";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from "lucide-react";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";

/** Horizontal and vertical alignment for one Layout column. */
export interface ColAlign {
  h: "left" | "center" | "right";
  v: "top" | "center" | "bottom";
}

const H_OPTIONS = [
  { value: "left"   as const, Icon: AlignLeft,   label: "Align left" },
  { value: "center" as const, Icon: AlignCenter,  label: "Align center" },
  { value: "right"  as const, Icon: AlignRight,   label: "Align right" },
];

const V_OPTIONS = [
  { value: "top"    as const, Icon: AlignStartVertical,  label: "Align top" },
  { value: "center" as const, Icon: AlignCenterVertical, label: "Align middle" },
  { value: "bottom" as const, Icon: AlignEndVertical,    label: "Align bottom" },
];

/** Tailwind classes for the flex container based on h-alignment. */
const H_CLASS: Record<ColAlign["h"], string> = {
  left:   "items-start",
  center: "items-center",
  right:  "items-end",
};

/** Tailwind classes for the flex container based on v-alignment. */
const V_CLASS: Record<ColAlign["v"], string> = {
  top:    "justify-start",
  center: "justify-center",
  bottom: "justify-end",
};

/** Returns both Tailwind class strings for a given ColAlign. */
export function colAlignClasses(align: ColAlign): { hClass: string; vClass: string } {
  return {
    hClass: H_CLASS[align.h] ?? H_CLASS.left,
    vClass: V_CLASS[align.v] ?? V_CLASS.top,
  };
}

/**
 * Factory for a custom Puck inspector field that renders a two-row
 * icon strip: horizontal alignment on row 1, vertical alignment on row 2.
 *
 * Usage in a block's `fields` object:
 *
 *   col0: alignmentField("Column 1 alignment"),
 *   col1: alignmentField("Column 2 alignment"),
 */
export function alignmentField(label: string): CustomField<ColAlign> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => {
      const h = value?.h ?? "left";
      const v = value?.v ?? "top";

      return (
        <BlockFieldLabel label={label}>
          <div className="space-y-1">
            {/* Row 1 — horizontal */}
            <div role="group" aria-label="Horizontal alignment" className="flex gap-1">
              {H_OPTIONS.map(({ value: hv, Icon, label: lbl }) => (
                <button
                  key={hv}
                  type="button"
                  aria-label={lbl}
                  aria-pressed={h === hv}
                  onClick={() => onChange({ h: hv, v })}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded border transition ${
                    h === hv
                      ? "border-brand-green bg-brand-light-green text-brand-green"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
            {/* Row 2 — vertical */}
            <div role="group" aria-label="Vertical alignment" className="flex gap-1">
              {V_OPTIONS.map(({ value: vv, Icon, label: lbl }) => (
                <button
                  key={vv}
                  type="button"
                  aria-label={lbl}
                  aria-pressed={v === vv}
                  onClick={() => onChange({ h, v: vv })}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded border transition ${
                    v === vv
                      ? "border-brand-green bg-brand-light-green text-brand-green"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </BlockFieldLabel>
      );
    },
  };
}
