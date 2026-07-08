import type { CustomField } from "@measured/puck";
import { ColorPill, GRAY_PRESETS } from "@core/components/ColorPill";

/**
 * A Puck CustomField that renders a `ColorPill` — the same popover-based
 * swatch picker used on the theme Style/UI settings page. Designed for
 * block field panels in the builder right rail.
 *
 * Empty string is a valid value when `allowEmpty` is true — meaning "no
 * override / inherit". Brand presets are accepted as an optional prop
 * (theme-context callers can pass them in), and the standard gray-scale
 * preset row is always included.
 */
export interface HexColorFieldOptions {
  label: string;
  /** When true, the picker shows a Clear button and accepts an empty
   *  string as a valid value. Defaults to true. */
  allowEmpty?: boolean;
  /** Brand preset row shown above the grays. Most block-level callers
   *  pass none — these come from theme settings. */
  brandPresets?: { label: string; value: string }[];
}

export function hexColorField<T extends string | undefined = string>(opts: HexColorFieldOptions): {
  type: "custom";
  label: string;
  render: CustomField<T>["render"];
} {
  const allowEmpty = opts.allowEmpty ?? true;
  const brandPresets = opts.brandPresets ?? [];

  const Render: CustomField<T>["render"] = function HexColorFieldRender({ value, onChange }) {
    const stringValue = typeof value === "string" ? value : "";
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-medium text-slate-700">{opts.label}</div>
        <ColorPill
          value={stringValue}
          onChange={(next) => onChange(next as T)}
          brandPresets={brandPresets}
          grayPresets={[...GRAY_PRESETS]}
          allowClear={allowEmpty}
        />
      </div>
    );
  };

  return { type: "custom", label: opts.label, render: Render };
}
