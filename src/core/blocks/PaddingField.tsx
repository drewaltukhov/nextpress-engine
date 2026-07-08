import type { CSSProperties } from "react";
import type { CustomField } from "@measured/puck";
import { BlockFieldLabel } from "./BlockFieldLabel";

/** Per-side padding values, all in rem. */
export interface PaddingValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** All-zero padding — safe default for any block. */
export const ZERO_PADDING: PaddingValue = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Defensive normaliser. Accepts:
 *  - the canonical `{ top, right, bottom, left }` object
 *  - a bare `number` (legacy uniform-padding storage — coerced to all sides)
 *  - `undefined` / `null`
 * and always returns a complete `PaddingValue`. Callers can rely on every
 * side being a finite non-negative number.
 */
export function normalizePadding(value: PaddingValue | number | null | undefined): PaddingValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (value && typeof value === "object") {
    const v = value as Partial<PaddingValue>;
    return {
      top:    Number.isFinite(v.top)    ? (v.top    as number) : 0,
      right:  Number.isFinite(v.right)  ? (v.right  as number) : 0,
      bottom: Number.isFinite(v.bottom) ? (v.bottom as number) : 0,
      left:   Number.isFinite(v.left)   ? (v.left   as number) : 0,
    };
  }
  return ZERO_PADDING;
}

/**
 * Inline-style helper. Converts a `PaddingValue` (or legacy number) into
 * a `CSSProperties` object suitable for spreading into `style={...}`. Returns
 * `undefined` when every side is zero so callers can skip the style attr
 * entirely (avoids polluting the public DOM with `style="padding:0"`).
 */
export function paddingStyle(value: PaddingValue | number | null | undefined): CSSProperties | undefined {
  const p = normalizePadding(value);
  if (p.top === 0 && p.right === 0 && p.bottom === 0 && p.left === 0) return undefined;
  return {
    paddingTop:    `${p.top}rem`,
    paddingRight:  `${p.right}rem`,
    paddingBottom: `${p.bottom}rem`,
    paddingLeft:   `${p.left}rem`,
  };
}

/** Range guards on each numeric input — keeps the UI predictable. */
const MIN = 0;
const MAX = 8;
const STEP = 0.25;

const INPUT_CLASS =
  "h-7 w-12 rounded border border-slate-200 bg-white px-1 text-right text-xs text-slate-700 " +
  "focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green/40";

const SIDE_LABEL_CLASS = "text-[9px] uppercase tracking-wider text-slate-400 text-center";

/**
 * Factory for a custom Puck inspector field that edits per-side padding
 * (top / right / bottom / left, all in rem) using a 3×3 cross layout —
 * top-center, middle-left, middle-right, bottom-center cells hold the
 * numeric inputs; the corner and centre cells are empty.
 *
 * Usage in a block's `fields` object:
 *
 *   col0Padding: paddingField("Column 1 padding"),
 *
 * The render function should pull the value out and apply it via
 * `style={paddingStyle(value)}` to honour the per-side numbers.
 */
export function paddingField(label: string): CustomField<PaddingValue> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => {
      const p = normalizePadding(value);

      const setSide = (side: keyof PaddingValue) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.currentTarget.valueAsNumber;
        const next = Number.isFinite(raw) ? Math.min(MAX, Math.max(MIN, raw)) : 0;
        onChange({ ...p, [side]: next });
      };

      return (
        <BlockFieldLabel label={label}>
          <div
            role="group"
            aria-label={`${label} — top, right, bottom, left in rem`}
            className="grid w-fit grid-cols-3 items-center gap-1"
          >
            {/* row 1: blank | top | blank */}
            <div />
            <div className="flex flex-col items-center gap-0.5">
              <input
                type="number"
                min={MIN}
                max={MAX}
                step={STEP}
                value={p.top}
                onChange={setSide("top")}
                aria-label="Padding top (rem)"
                className={INPUT_CLASS}
              />
              <span className={SIDE_LABEL_CLASS}>T</span>
            </div>
            <div />

            {/* row 2: left | centre marker | right */}
            <div className="flex flex-col items-center gap-0.5">
              <input
                type="number"
                min={MIN}
                max={MAX}
                step={STEP}
                value={p.left}
                onChange={setSide("left")}
                aria-label="Padding left (rem)"
                className={INPUT_CLASS}
              />
              <span className={SIDE_LABEL_CLASS}>L</span>
            </div>
            <div className="flex h-7 items-center justify-center text-[10px] text-slate-400">rem</div>
            <div className="flex flex-col items-center gap-0.5">
              <input
                type="number"
                min={MIN}
                max={MAX}
                step={STEP}
                value={p.right}
                onChange={setSide("right")}
                aria-label="Padding right (rem)"
                className={INPUT_CLASS}
              />
              <span className={SIDE_LABEL_CLASS}>R</span>
            </div>

            {/* row 3: blank | bottom | blank */}
            <div />
            <div className="flex flex-col items-center gap-0.5">
              <input
                type="number"
                min={MIN}
                max={MAX}
                step={STEP}
                value={p.bottom}
                onChange={setSide("bottom")}
                aria-label="Padding bottom (rem)"
                className={INPUT_CLASS}
              />
              <span className={SIDE_LABEL_CLASS}>B</span>
            </div>
            <div />
          </div>
        </BlockFieldLabel>
      );
    },
  };
}
