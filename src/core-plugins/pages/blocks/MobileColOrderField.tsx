"use client";

/**
 * Client-only renderer for the Layout block's `mobileColOrder` field.
 * Lives in its own `"use client"` file because it uses `usePuck` to
 * read the parent block's `variant` prop, and `usePuck` isn't exposed
 * on Puck's RSC entry. Importing it into Layout.tsx (which is reached
 * by server components via `pages/blocks/index.ts`) would break the
 * server build.
 */

import { usePuck } from "@measured/puck";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";

/** Variant → column count map. Duplicates the per-variant arity from
 *  Layout.tsx's `VARIANT_COL_CLASSES_KEEP`. Kept small + literal so the
 *  client bundle doesn't pull all of Layout.tsx in. */
const VARIANT_COL_COUNT: Record<string, number> = {
  "full": 1,
  "halves": 2,
  "thirds": 3,
  "quarters": 4,
  "quarter-half-quarter": 3,
  "quarter-three-quarters": 2,
  "three-quarters-quarter": 2,
  "third-two-thirds": 2,
  "two-thirds-third": 2,
  "auto-max-auto": 3,
  "max-auto-auto": 3,
  "max-auto": 2,
};

export function MobileColOrderField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: number[] | undefined) => void;
}) {
  // Read the parent block's `variant` so we render the right number
  // of position pickers. Falls back to value's length, then 4, when
  // the selection isn't available yet.
  const { selectedItem } = usePuck();
  const selectedVariant = (selectedItem?.props as { variant?: string } | undefined)?.variant;
  const variantCount = selectedVariant ? VARIANT_COL_COUNT[selectedVariant] ?? 0 : 0;
  const colCountFromValue = Array.isArray(value) && value.length > 0 ? value.length : 0;
  const count = variantCount || colCountFromValue || 4;

  const current: number[] = Array.isArray(value)
    ? Array.from({ length: count }, (_, i) =>
        typeof value[i] === "number" && value[i] >= 0 && value[i] < count ? (value[i] as number) : i,
      )
    : Array.from({ length: count }, (_, i) => i);
  const isNatural = current.every((v, i) => v === i);

  return (
    <BlockFieldLabel label="Mobile column order">
      <div className="space-y-1.5">
        <p className="text-xs text-slate-500">
          For each visual position (left → right) on mobile, pick which desktop column should land
          there. Leave at natural order to inherit desktop order.
        </p>
        {Array.from({ length: count }).map((_, pos) => (
          <div key={pos} className="flex items-center gap-2 text-sm">
            <span className="w-20 shrink-0 text-slate-500">Position {pos + 1}</span>
            <select
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={String(current[pos])}
              onChange={(e) => {
                const next = current.slice();
                next[pos] = Number(e.target.value);
                const becomingNatural = next.every((v, i) => v === i);
                onChange(becomingNatural ? undefined : next);
              }}
            >
              {Array.from({ length: count }).map((_, src) => (
                <option key={src} value={src}>
                  Desktop column {src + 1}
                </option>
              ))}
            </select>
          </div>
        ))}
        {!isNatural ? (
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700 underline"
            onClick={() => onChange(undefined)}
          >
            Reset to natural order
          </button>
        ) : null}
      </div>
    </BlockFieldLabel>
  );
}
