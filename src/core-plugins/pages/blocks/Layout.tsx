import type { ComponentConfig } from "@measured/puck";
import { listAllBlocks, type RegisteredBlock } from "@core/blocks/registry";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { paddingField, paddingStyle, type PaddingValue, ZERO_PADDING } from "@core/blocks/PaddingField";
import { hexColorField } from "@core/blocks/HexColorField";
import { alignmentField, colAlignClasses, type ColAlign } from "./AlignmentField";
import { MobileColOrderField } from "./MobileColOrderField";

export type LayoutVariant =
  | "full"                    // 100% (single column — handy as a chrome-zone wrapper)
  | "halves"                  // 1/2 + 1/2
  | "thirds"                  // 1/3 + 1/3 + 1/3
  | "quarters"                // 1/4 + 1/4 + 1/4 + 1/4
  | "quarter-half-quarter"    // 1/4 + 1/2 + 1/4
  | "quarter-three-quarters"  // 1/4 + 3/4
  | "three-quarters-quarter"  // 3/4 + 1/4
  | "third-two-thirds"        // 1/3 + 2/3
  | "two-thirds-third"        // 2/3 + 1/3
  // "auto + max + auto" — outer columns shrink to their content's
  // intrinsic width, middle column grows to fill the remaining space.
  // Designed for header rows (logo + nav + search) where the brand
  // mark and search trigger have fixed visual weight and the nav menu
  // takes whatever room is left.
  | "auto-max-auto"
  // "max + auto + auto" — left column takes remaining space, the two
  // trailing columns shrink to their content's intrinsic width.
  // Useful for headers where a wide brand block sits next to two
  // narrow trailing items (e.g. logo + nav + cart icons).
  | "max-auto-auto"
  // "max + auto" — left column grows, trailing column shrinks to its
  // content. Two-column variant of the above; common for "title +
  // action" rows where the title text floods and the action stays
  // tight on the right.
  | "max-auto";

export type LayoutMobileMode = "stack" | "keep" | "bar";

/** Per-column mobile horizontal alignment override (below `md`, 768px).
 *  `"inherit"` keeps the column's desktop alignment at every breakpoint;
 *  the other values emit a `max-md:items-*` class that overrides the
 *  desktop alignment only below 768px. */
export type ColMobileAlign = "inherit" | "left" | "center" | "right";

/** Tailwind classes for the mobile horizontal override. Full literals
 *  so the JIT scanner picks them up. `inherit` resolves to no class. */
const MOBILE_H_CLASS: Record<Exclude<ColMobileAlign, "inherit">, string> = {
  left:   "max-md:items-start",
  center: "max-md:items-center",
  right:  "max-md:items-end",
};

function mobileHClassFor(value: ColMobileAlign | undefined): string {
  if (!value || value === "inherit") return "";
  return MOBILE_H_CLASS[value];
}

const MOBILE_ALIGN_OPTIONS: ReadonlyArray<{ label: string; value: ColMobileAlign }> = [
  { label: "Inherit (use desktop)", value: "inherit" },
  { label: "Left",                  value: "left" },
  { label: "Center",                value: "center" },
  { label: "Right",                 value: "right" },
];

function mobileAlignField(label: string) {
  return {
    type: "select" as const,
    label,
    options: MOBILE_ALIGN_OPTIONS as unknown as { label: string; value: ColMobileAlign }[],
  };
}

export interface LayoutProps {
  variant: LayoutVariant;
  /** Hide on mobile / desktop — these props are owned by the
   *  centralised `withVisibilityProps` decorator in
   *  `@core/blocks/registry.ts`, which injects the fields + wraps every
   *  block's render with `max-md:hidden` / `md:hidden`. Declared here
   *  for type-safety only; the Layout's own field + render code below
   *  no longer references them (the decorator handles it). */
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  /** Override the column-template variant below `md`. Must have the
   *  same column count as `variant` (the picker filters to matching
   *  arity) so saved DropZones still have a track to land in.
   *  Unset → uses the desktop `variant` at every breakpoint. */
  mobileVariant?: LayoutVariant;
  /** Per-column visual order below `md`. Length === active variant's
   *  column count; values are a permutation of `[0..N-1]`. Emits
   *  `order-N md:order-K` classes per column. Unset → natural DOM
   *  order at every breakpoint. */
  mobileColOrder?: number[];
  /** Per-column alignment. Length always 4; only the first N are used. */
  col0: ColAlign;
  col1: ColAlign;
  col2: ColAlign;
  col3: ColAlign;
  /** Outer top margin in rem. */
  marginTopRem: number;
  /** Outer bottom margin in rem. */
  marginBottomRem: number;
  /** Per-column padding (per-side, in rem). Length 4; only first N used.
   *  Older saved data may carry a bare `number` here — `paddingStyle()` /
   *  `normalizePadding()` from `@core/blocks/PaddingField` accept both
   *  shapes and coerce numbers to uniform padding. */
  col0Padding: PaddingValue;
  col1Padding: PaddingValue;
  col2Padding: PaddingValue;
  col3Padding: PaddingValue;
  /** Per-column mobile horizontal alignment override. Length 4; only
   *  first N are used. Defaults to `"inherit"` so saved blocks render
   *  byte-identical until the user opts in. */
  col0MobileAlign?: ColMobileAlign;
  col1MobileAlign?: ColMobileAlign;
  col2MobileAlign?: ColMobileAlign;
  col3MobileAlign?: ColMobileAlign;
  /** Mobile behavior below the `md` (768px) breakpoint:
   *   - `"stack"` (default) — fraction columns collapse to full width
   *     and stack vertically; grid columns collapse to a single column.
   *     Universal mobile-friendly default.
   *   - `"keep"` — preserve the desktop shape at every breakpoint.
   *     Use for rows whose columns are already narrow enough to coexist
   *     on phones (e.g. an `auto-max-auto` header where every cell is
   *     an icon-sized button).
   *   - `"bar"` — collapse to a single-line bar: the row stays one line,
   *     column 0 pins to the left edge, and columns 1..N shrink to their
   *     content and hug the right edge in *reverse* order. Built for
   *     headers — a logo / nav / actions row reads as logo / actions /
   *     nav-trigger on mobile, so the nav's hamburger lands at the far
   *     edge. Desktop (`md+`) renders byte-identical to the chosen
   *     variant — `bar` only ever adds `md:`-prefixed resets.
   *  Older saved blocks without this prop default to `"stack"` at render
   *  time so every existing site picks up sensible mobile behavior. */
  mobileMode?: LayoutMobileMode;
  /** Band background color (hex). Painted behind the columns, inside the
   *  block's container constraint. Empty / unset → no background. */
  bgColor?: string;
  /** Hairline border color above the band. Empty / unset → no border. */
  borderTopColor?: string;
  /** Hairline border color below the band. Empty / unset → no border. */
  borderBottomColor?: string;
  /** Inner top padding (rem) — space *inside* the band, between the top
   *  border / background edge and the columns. Distinct from
   *  `marginTopRem` which is outer space. */
  paddingTopRem?: number;
  /** Inner bottom padding (rem). */
  paddingBottomRem?: number;
}

/**
 * Per-variant Tailwind width classes — one entry per column. Length of
 * the array IS the column count for that variant. All classes are full
 * literals so the Tailwind JIT scanner picks them up.
 *
 * `_KEEP` = the original desktop-only widths (used when `mobileMode` is
 * `"keep"`). `_STACK` = same fractions wrapped with `w-full md:` so
 * columns occupy 100% width below the `md` breakpoint and the original
 * fraction at `md+`.
 */
const VARIANT_COL_CLASSES_KEEP: Record<LayoutVariant, readonly string[]> = {
  "full":                   ["w-full"],
  "halves":                 ["w-1/2", "w-1/2"],
  "thirds":                 ["w-1/3", "w-1/3", "w-1/3"],
  "quarters":               ["w-1/4", "w-1/4", "w-1/4", "w-1/4"],
  "quarter-half-quarter":   ["w-1/4", "w-1/2", "w-1/4"],
  "quarter-three-quarters": ["w-1/4", "w-3/4"],
  "three-quarters-quarter": ["w-3/4", "w-1/4"],
  "third-two-thirds":       ["w-1/3", "w-2/3"],
  "two-thirds-third":       ["w-2/3", "w-1/3"],
  // No per-column width classes — the outer wrapper uses CSS grid with
  // `grid-cols-[auto_minmax(0,1fr)_auto]`, so each column sizes itself
  // intrinsically (outer) or fills (middle).
  "auto-max-auto":          ["", "", ""],
  // Grid variants: leading column is `minmax(0,1fr)` (the "max"
  // column), trailing columns are `auto` (intrinsic-sized).
  "max-auto-auto":          ["", "", ""],
  "max-auto":               ["", ""],
};

const VARIANT_COL_CLASSES_STACK: Record<LayoutVariant, readonly string[]> = {
  "full":                   ["w-full"],
  "halves":                 ["w-full md:w-1/2", "w-full md:w-1/2"],
  "thirds":                 ["w-full md:w-1/3", "w-full md:w-1/3", "w-full md:w-1/3"],
  "quarters":               ["w-full md:w-1/4", "w-full md:w-1/4", "w-full md:w-1/4", "w-full md:w-1/4"],
  "quarter-half-quarter":   ["w-full md:w-1/4", "w-full md:w-1/2", "w-full md:w-1/4"],
  "quarter-three-quarters": ["w-full md:w-1/4", "w-full md:w-3/4"],
  "three-quarters-quarter": ["w-full md:w-3/4", "w-full md:w-1/4"],
  "third-two-thirds":       ["w-full md:w-1/3", "w-full md:w-2/3"],
  "two-thirds-third":       ["w-full md:w-2/3", "w-full md:w-1/3"],
  // Grid variants: outer wrapper handles the responsive column-template
  // swap; per-cell classes are unchanged.
  "auto-max-auto":          ["", "", ""],
  "max-auto-auto":          ["", "", ""],
  "max-auto":               ["", ""],
};

/** Per-column width classes when `mobileMode = "bar"`: every column
 *  shrinks to its content (`w-auto`) below `md` so the row reads as a
 *  compact bar, then restores the variant fraction at `md+`. Mirrors
 *  `_STACK` but with `w-auto` instead of `w-full`. */
const VARIANT_COL_CLASSES_BAR: Record<LayoutVariant, readonly string[]> = {
  "full":                   ["w-full"],
  "halves":                 ["w-auto md:w-1/2", "w-auto md:w-1/2"],
  "thirds":                 ["w-auto md:w-1/3", "w-auto md:w-1/3", "w-auto md:w-1/3"],
  "quarters":               ["w-auto md:w-1/4", "w-auto md:w-1/4", "w-auto md:w-1/4", "w-auto md:w-1/4"],
  "quarter-half-quarter":   ["w-auto md:w-1/4", "w-auto md:w-1/2", "w-auto md:w-1/4"],
  "quarter-three-quarters": ["w-auto md:w-1/4", "w-auto md:w-3/4"],
  "three-quarters-quarter": ["w-auto md:w-3/4", "w-auto md:w-1/4"],
  "third-two-thirds":       ["w-auto md:w-1/3", "w-auto md:w-2/3"],
  "two-thirds-third":       ["w-auto md:w-2/3", "w-auto md:w-1/3"],
  // Grid variants: outer wrapper sizes the tracks; `bar` leaves grid
  // variants alone (they are already single-line bars).
  "auto-max-auto":          ["", "", ""],
  "max-auto-auto":          ["", "", ""],
  "max-auto":               ["", ""],
};

/** `mobileMode = "bar"` per-column `order-*` classes, indexed
 *  `[columnCount][columnIndex]`. Below `md`, column 0 keeps order 0
 *  (left edge) and columns 1..N reverse — the last desktop column lands
 *  at the far right of the collapsed bar. `md:` restores DOM order so
 *  desktop is untouched. Full literal strings for the Tailwind JIT. */
const BAR_ORDER: Record<number, readonly string[]> = {
  1: [""],
  2: ["", "order-1 md:order-1"],
  3: ["", "order-2 md:order-1", "order-1 md:order-2"],
  4: ["", "order-3 md:order-1", "order-2 md:order-2", "order-1 md:order-3"],
};

/** Variants whose outer container is CSS grid instead of flex+widths.
 *  Used by every render path to swap the wrapper class and skip the
 *  per-column `w-*` classes (they'd fight the grid track sizing). */
const GRID_VARIANTS: ReadonlySet<LayoutVariant> = new Set<LayoutVariant>([
  "auto-max-auto",
  "max-auto-auto",
  "max-auto",
]);

/**
 * Raw CSS `grid-template-columns` value per variant — used when the
 * widget switches to a single responsive grid wrapper (via the
 * `mobileVariant` override). Fraction variants get equivalent
 * fr-based templates so the same wrapper handles both fraction and
 * grid variants uniformly.
 *
 * Consumed by the `np-layout-responsive` wrapper, which reads
 * `--np-mobile-template` below `md` and `--np-desktop-template` at md+.
 * See `src/app/globals.css` (or theme stylesheet) for the rule.
 */
const RAW_GRID_TEMPLATE: Record<LayoutVariant, string> = {
  "full":                   "1fr",
  "halves":                 "1fr 1fr",
  "thirds":                 "1fr 1fr 1fr",
  "quarters":               "1fr 1fr 1fr 1fr",
  "quarter-half-quarter":   "1fr 2fr 1fr",
  "quarter-three-quarters": "1fr 3fr",
  "three-quarters-quarter": "3fr 1fr",
  "third-two-thirds":       "1fr 2fr",
  "two-thirds-third":       "2fr 1fr",
  "auto-max-auto":          "auto minmax(0,1fr) auto",
  "max-auto-auto":          "minmax(0,1fr) auto auto",
  "max-auto":               "minmax(0,1fr) auto",
};

const VARIANT_GRID_TEMPLATE: Partial<Record<LayoutVariant, string>> = {
  "auto-max-auto": "grid-cols-[auto_minmax(0,1fr)_auto]",
  "max-auto-auto": "grid-cols-[minmax(0,1fr)_auto_auto]",
  "max-auto":      "grid-cols-[minmax(0,1fr)_auto]",
};

/** Per grid-variant: which column index holds the `minmax(0,1fr)` track
 *  (the "max" / flexible column). The cell at that index needs
 *  `w-full min-w-0` so its inner flex container expands to fill the
 *  whole track instead of shrinking to its content. Without this, an
 *  `max + auto` row collapses the menu column to just its labels and
 *  leaves the rest of the track empty. */
const GRID_VARIANT_MAX_COL_INDEX: Partial<Record<LayoutVariant, number>> = {
  "auto-max-auto": 1,
  "max-auto-auto": 0,
  "max-auto": 0,
};

/** Grid-variant outer classes when `mobileMode = "stack"`: single column
 *  below `md`, original column template at `md+`. Tailwind JIT picks up
 *  arbitrary-value classes with the `md:` prefix as long as the full
 *  string appears in source — these are all literals. */
const VARIANT_GRID_TEMPLATE_STACK: Partial<Record<LayoutVariant, string>> = {
  "auto-max-auto": "grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)_auto]",
  "max-auto-auto": "grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto]",
  "max-auto":      "grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto]",
};

const DEFAULT_ALIGN: ColAlign = { h: "left", v: "top" };

/** Human-readable label for the col-N DropZone zones (theme-builder schematic only). */
const COL_LABELS: Record<LayoutVariant, string[]> = {
  "full":                   ["Full width"],
  "halves":                 ["Left half", "Right half"],
  "thirds":                 ["Left third", "Center third", "Right third"],
  "quarters":               ["Col 1", "Col 2", "Col 3", "Col 4"],
  "quarter-half-quarter":   ["Left quarter", "Center half", "Right quarter"],
  "quarter-three-quarters": ["Quarter", "Three quarters"],
  "three-quarters-quarter": ["Three quarters", "Quarter"],
  "third-two-thirds":       ["Third", "Two thirds"],
  "two-thirds-third":       ["Two thirds", "Third"],
  "auto-max-auto":          ["Auto", "Max", "Auto"],
  "max-auto-auto":          ["Max", "Auto", "Auto"],
  "max-auto":               ["Max", "Auto"],
};

// Stable zone names — keyed by index, never by variant, so zone ids
// survive variant changes without breaking saved Puck data.
const ZONE_NAMES = ["col-0", "col-1", "col-2", "col-3"] as const;
type ZoneName = (typeof ZONE_NAMES)[number];

type ColKey = "col0" | "col1" | "col2" | "col3";
const COL_KEYS: ColKey[] = ["col0", "col1", "col2", "col3"];

type PaddingKey = "col0Padding" | "col1Padding" | "col2Padding" | "col3Padding";
const PADDING_KEYS: PaddingKey[] = ["col0Padding", "col1Padding", "col2Padding", "col3Padding"];

type MobileAlignKey = "col0MobileAlign" | "col1MobileAlign" | "col2MobileAlign" | "col3MobileAlign";
const MOBILE_ALIGN_KEYS: MobileAlignKey[] = [
  "col0MobileAlign", "col1MobileAlign", "col2MobileAlign", "col3MobileAlign",
];

// Which blocks are allowed inside Layout columns. Layout is a generic
// composition primitive — usable on page bodies, post bodies, theme
// template surfaces, sidebars, footers — and we want every registered
// block to be droppable inside a column regardless of which surface
// originally registered it. Computed at render time (same StickyContainer
// pattern) so newly-registered blocks automatically become droppable.
//
// Recursive Layout is excluded — nesting Layouts adds a lot of cognitive
// overhead and the existing flex/width math doesn't compose cleanly.
function getAllowedBlocks(): string[] {
  return listAllBlocks()
    .map((b) => b.name)
    .filter((name) => name !== "Layout");
}

/**
 * Per-column `order-N md:order-K` class table for the
 * `mobileColOrder` prop. Below `md`, columns are reordered per the
 * `mobileColOrder` array; at `md+` they restore natural DOM order so
 * desktop is byte-identical.
 *
 * 1-indexed (positions 1..N) to avoid `order-0` (not a default Tailwind
 * utility — the default scale starts at `order-1`). Full Tailwind
 * literals so the JIT scanner finds them. Supports up to 12 columns
 * (max-column variant today is `quarters` at 4, comfortable headroom).
 */
const ORDER_AT_MOBILE: ReadonlyArray<string> = [
  "order-1", "order-2", "order-3", "order-4", "order-5", "order-6",
  "order-7", "order-8", "order-9", "order-10", "order-11", "order-12",
];
const ORDER_AT_DESKTOP: ReadonlyArray<string> = [
  "md:order-1", "md:order-2", "md:order-3", "md:order-4", "md:order-5", "md:order-6",
  "md:order-7", "md:order-8", "md:order-9", "md:order-10", "md:order-11", "md:order-12",
];

/** Custom-field render passthrough to the client-only component.
 *  See `./MobileColOrderField.tsx` for why it has to live in its own
 *  `"use client"` file. */
function renderMobileColOrderField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: number[] | undefined) => void;
}): React.ReactElement {
  return <MobileColOrderField value={value} onChange={onChange} />;
}

/**
 * Compact label for the theme-builder schematic. Shows nothing when
 * there's no padding, "pad Nrem" when all four sides match, and
 * "T·R·B·L" when sides differ — keeps the schematic readable without
 * cramming a full 4-axis number into the column header.
 */
function padSummaryLabel(value: PaddingValue | number | null | undefined): string {
  const p = (typeof value === "number" || value == null)
    ? { top: typeof value === "number" ? value : 0, right: 0, bottom: 0, left: 0 }
    : value;
  // Re-normalise for safety; PaddingField writes consistent objects but
  // legacy data may have undefined sides.
  const t = Number.isFinite(p.top)    ? p.top    : 0;
  const r = Number.isFinite(p.right)  ? p.right  : 0;
  const b = Number.isFinite(p.bottom) ? p.bottom : 0;
  const l = Number.isFinite(p.left)   ? p.left   : 0;
  if (t === 0 && r === 0 && b === 0 && l === 0) return "";
  if (t === r && r === b && b === l) return `pad ${t}rem`;
  return `pad ${t}·${r}·${b}·${l}rem`;
}

export const Layout: ComponentConfig<LayoutProps> = {
  label: "Layout",
  fields: {
    variant: blockSelectField<LayoutVariant>({
      label: "Variant",
      options: [
        { label: "100%",             value: "full" },
        { label: "1/2 + 1/2",        value: "halves" },
        { label: "1/3 + 1/3 + 1/3",  value: "thirds" },
        { label: "1/4 + 1/4 + 1/4 + 1/4", value: "quarters" },
        { label: "1/4 + 1/2 + 1/4",  value: "quarter-half-quarter" },
        { label: "1/4 + 3/4",        value: "quarter-three-quarters" },
        { label: "3/4 + 1/4",        value: "three-quarters-quarter" },
        { label: "1/3 + 2/3",        value: "third-two-thirds" },
        { label: "2/3 + 1/3",        value: "two-thirds-third" },
        { label: "auto + max + auto", value: "auto-max-auto" },
        { label: "max + auto + auto", value: "max-auto-auto" },
        { label: "max + auto",        value: "max-auto" },
      ],
    }),
    col0: alignmentField("Column 1 alignment"),
    col0Padding: paddingField("Column 1 padding"),
    col1: alignmentField("Column 2 alignment"),
    col1Padding: paddingField("Column 2 padding"),
    col2: alignmentField("Column 3 alignment"),
    col2Padding: paddingField("Column 3 padding"),
    col3: alignmentField("Column 4 alignment"),
    col3Padding: paddingField("Column 4 padding"),
    marginTopRem: {
      type: "number",
      label: "Top margin (rem)",
      min: 0,
      max: 8,
      step: 0.25,
    },
    marginBottomRem: {
      type: "number",
      label: "Bottom margin (rem)",
      min: 0,
      max: 8,
      step: 0.25,
    },
    mobileMode: {
      type: "select",
      label: "Mobile mode",
      options: [
        { label: "Stack — columns become full-width below 768px", value: "stack" },
        { label: "Keep — preserve column shape at every breakpoint", value: "keep" },
        { label: "Bar — one-line bar below 768px (logo left, rest right)", value: "bar" },
      ],
    },
    col0MobileAlign: mobileAlignField("Column 1 mobile alignment"),
    col1MobileAlign: mobileAlignField("Column 2 mobile alignment"),
    col2MobileAlign: mobileAlignField("Column 3 mobile alignment"),
    col3MobileAlign: mobileAlignField("Column 4 mobile alignment"),
    bgColor: hexColorField<string | undefined>({ label: "Band background color" }),
    borderTopColor: hexColorField<string | undefined>({ label: "Top border color" }),
    borderBottomColor: hexColorField<string | undefined>({ label: "Bottom border color" }),
    paddingTopRem: {
      type: "number",
      label: "Inner top padding (rem)",
      min: 0,
      max: 8,
      step: 0.25,
    },
    paddingBottomRem: {
      type: "number",
      label: "Inner bottom padding (rem)",
      min: 0,
      max: 8,
      step: 0.25,
    },
    // hideOnMobile / hideOnDesktop fields are injected by the
    // centralised `withVisibilityProps` decorator in
    // `@core/blocks/registry.ts` — every block (Newspaper, PostsGrid,
    // Layout, …) picks them up automatically without per-widget
    // boilerplate.
    mobileVariant: {
      type: "select",
      label: "Mobile variant",
      // Field options exposed here are the universe; `resolveFields`
      // filters to variants with the same column count as the active
      // desktop variant so saved DropZones never lose their track.
      options: [
        { label: "(Same as desktop)",       value: "" as unknown as LayoutVariant },
        { label: "100%",                    value: "full" },
        { label: "1/2 + 1/2",               value: "halves" },
        { label: "1/3 + 1/3 + 1/3",         value: "thirds" },
        { label: "1/4 + 1/4 + 1/4 + 1/4",   value: "quarters" },
        { label: "1/4 + 1/2 + 1/4",         value: "quarter-half-quarter" },
        { label: "1/4 + 3/4",               value: "quarter-three-quarters" },
        { label: "3/4 + 1/4",               value: "three-quarters-quarter" },
        { label: "1/3 + 2/3",               value: "third-two-thirds" },
        { label: "2/3 + 1/3",               value: "two-thirds-third" },
        { label: "auto + max + auto",       value: "auto-max-auto" },
        { label: "max + auto + auto",       value: "max-auto-auto" },
        { label: "max + auto",              value: "max-auto" },
      ],
    },
    mobileColOrder: {
      type: "custom",
      label: "Mobile column order",
      render: renderMobileColOrderField,
    },
  },
  defaultProps: {
    variant: "halves",
    col0: DEFAULT_ALIGN,
    col1: DEFAULT_ALIGN,
    col2: DEFAULT_ALIGN,
    col3: DEFAULT_ALIGN,
    col0Padding: ZERO_PADDING,
    col1Padding: ZERO_PADDING,
    col2Padding: ZERO_PADDING,
    col3Padding: ZERO_PADDING,
    marginTopRem: 1,
    marginBottomRem: 1,
    mobileMode: "stack",
    col0MobileAlign: "inherit",
    col1MobileAlign: "inherit",
    col2MobileAlign: "inherit",
    col3MobileAlign: "inherit",
    bgColor: "",
    borderTopColor: "",
    borderBottomColor: "",
    paddingTopRem: 0,
    paddingBottomRem: 0,
    // hideOnMobile / hideOnDesktop defaults supplied by the registry
    // decorator. mobileVariant + mobileColOrder default undefined.
  },
  // Hide alignment + padding fields for columns that don't exist in the
  // active variant. Always-shown fields (variant + margins) pass through;
  // colN / colNPadding fields are gated on the active variant's column count.
  resolveFields: (data, { fields }) => {
    const count = (VARIANT_COL_CLASSES_KEEP[data.props?.variant ?? "halves"] ?? VARIANT_COL_CLASSES_KEEP.halves).length;
    const ALWAYS_VISIBLE = new Set([
      "variant",
      "marginTopRem",
      "marginBottomRem",
      "mobileMode",
      "bgColor",
      "borderTopColor",
      "borderBottomColor",
      "paddingTopRem",
      "paddingBottomRem",
      // Universal decorator-injected fields (see withVisibilityProps in
      // @core/blocks/registry.ts). They have to be listed here because
      // Layout's resolveFields is an allow-list, unlike every other
      // widget whose resolveFields is a deny-list and lets unknown
      // fields fall through. Add new universal fields here too.
      "hideOnMobile",
      "hideOnDesktop",
      "customClassName",
      "mobileVariant",
    ]);
    return Object.fromEntries(
      Object.entries(fields).map(([key, field]) => {
        // Filter `mobileVariant` options to variants with the same column
        // count as the desktop variant so DropZones never lose their
        // track. The placeholder "(Same as desktop)" entry stays.
        if (key === "mobileVariant" && field?.type === "select") {
          const filtered = (field.options as Array<{ label: string; value: string }>).filter((opt) => {
            if (opt.value === "") return true;
            const variantCount = (VARIANT_COL_CLASSES_KEEP[opt.value as LayoutVariant] ?? []).length;
            return variantCount === count;
          });
          return [key, { ...field, options: filtered } as typeof field];
        }
        return [key, field];
      }).filter(([key]) => {
        if (ALWAYS_VISIBLE.has(key as string)) return true;
        // mobileColOrder shows only when there's something to reorder
        // (i.e. count > 1). Single-column layouts have nothing to swap.
        if (key === "mobileColOrder") return count > 1;
        const alignIdx = COL_KEYS.indexOf(key as ColKey);
        if (alignIdx >= 0) return alignIdx < count;
        const padIdx = PADDING_KEYS.indexOf(key as PaddingKey);
        if (padIdx >= 0) return padIdx < count;
        const mobileIdx = MOBILE_ALIGN_KEYS.indexOf(key as MobileAlignKey);
        if (mobileIdx >= 0) return mobileIdx < count;
        return false;
      }),
    ) as typeof fields;
  },
  render: ({
    variant,
    col0, col1, col2, col3,
    col0Padding, col1Padding, col2Padding, col3Padding,
    col0MobileAlign, col1MobileAlign, col2MobileAlign, col3MobileAlign,
    marginTopRem, marginBottomRem,
    mobileMode,
    bgColor, borderTopColor, borderBottomColor,
    paddingTopRem, paddingBottomRem,
    hideOnMobile, hideOnDesktop,
    mobileVariant, mobileColOrder,
    puck,
  }) => {
    const resolvedVariant: LayoutVariant = variant ?? "halves";
    // Default to "stack" so already-saved blocks (no `mobileMode` prop)
    // pick up sensible mobile behavior without an explicit re-save.
    const resolvedMobileMode: LayoutMobileMode = mobileMode ?? "stack";
    const isStack = resolvedMobileMode === "stack";
    const isBar = resolvedMobileMode === "bar";
    const colClassesSource = isBar
      ? VARIANT_COL_CLASSES_BAR
      : isStack
        ? VARIANT_COL_CLASSES_STACK
        : VARIANT_COL_CLASSES_KEEP;
    const colClasses = colClassesSource[resolvedVariant] ?? colClassesSource.halves;
    const count = colClasses.length;
    // Mobile variant override — only honored when it has the same column
    // count as the desktop variant (the picker filters this, but a
    // saved value that later mismatches the desktop variant gracefully
    // falls back to "no override"). Empty string from the select picker
    // is treated as "(Same as desktop)".
    const resolvedMobileVariant: LayoutVariant | null =
      mobileVariant && (mobileVariant as string) !== ""
        && (VARIANT_COL_CLASSES_KEEP[mobileVariant]?.length ?? 0) === count
        ? mobileVariant
        : null;
    // Mobile column order — normalised to the active column count.
    // Forgiving on length and content because the custom field UI can't
    // always know the parent's column count up front and may save more
    // entries than the active variant has columns. We:
    //   1. Take entries from the saved array that are valid + unique
    //      indices for the current `count`.
    //   2. Fill any remaining slots with unused indices in natural order.
    //   3. Return null when the result is already natural (no override).
    const resolvedMobileColOrder: number[] | null = (() => {
      if (!Array.isArray(mobileColOrder) || mobileColOrder.length === 0) return null;
      const used = new Set<number>();
      const normalized: (number | null)[] = Array.from({ length: count }, () => null);
      for (let pos = 0; pos < count; pos++) {
        const v = mobileColOrder[pos];
        if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < count && !used.has(v)) {
          normalized[pos] = v;
          used.add(v);
        }
      }
      for (let pos = 0; pos < count; pos++) {
        if (normalized[pos] === null) {
          for (let src = 0; src < count; src++) {
            if (!used.has(src)) {
              normalized[pos] = src;
              used.add(src);
              break;
            }
          }
        }
      }
      const final = normalized as number[];
      const natural = final.every((v, i) => v === i);
      return natural ? null : final;
    })();
    const colProps = [col0, col1, col2, col3];
    const colPadding = [col0Padding, col1Padding, col2Padding, col3Padding];
    const colMobileAlign: ReadonlyArray<ColMobileAlign | undefined> = [
      col0MobileAlign, col1MobileAlign, col2MobileAlign, col3MobileAlign,
    ];
    const labels = COL_LABELS[resolvedVariant] ?? [];
    const allow = getAllowedBlocks();

    // Grid-template variants (auto+max+auto and any future ones) drop
    // the per-column `w-*` classes and apply their track sizing on the
    // outer wrapper instead. Flex-based variants keep the original
    // shape so old saves render identically.
    //
    // `mobileMode = "stack"` wraps both flex + grid outers so they
    // collapse to a single column below `md` (768px):
    //   - flex: `flex flex-col md:flex-row` + per-col `w-full md:w-X/Y`.
    //   - grid: `grid grid-cols-1 md:grid-cols-[<original>]`.
    // `gap-y-4 md:gap-y-0` adds 1rem between stacked columns at mobile
    // (preventing zero-padding columns from visually colliding) and
    // collapses to zero on desktop so existing layouts render
    // pixel-identical at `md+`.
    //
    // `mobileMode = "bar"` keeps the flex row but, below `md`, lets every
    // column shrink to its content (`w-auto`) and adds a small `gap-2`;
    // `md:gap-0` + the `md:w-*` widths restore the variant exactly on
    // desktop. Grid variants ignore `bar` (already single-line bars).
    const isGridVariant = GRID_VARIANTS.has(resolvedVariant);
    const gridTemplateClass = isStack
      ? VARIANT_GRID_TEMPLATE_STACK[resolvedVariant] ?? ""
      : VARIANT_GRID_TEMPLATE[resolvedVariant] ?? "";
    const stackGapClass = isStack ? "gap-y-4 md:gap-y-0" : "";
    // When `mobileVariant` is set, the wrapper switches to grid (both
    // breakpoints) and applies a responsive `grid-template-columns`
    // via two CSS vars + a tiny global rule (see `np-layout-responsive`
    // in styles/np-layout.css). This sidesteps the Tailwind
    // combinatorial explosion of (desktopVariant × mobileVariant) pairs
    // while keeping a single DOM tree (Puck zones can't be duplicated).
    //
    // Mobile-variant grid templates use full literal CSS strings.
    const mobileGridTemplate = resolvedMobileVariant
      ? RAW_GRID_TEMPLATE[resolvedMobileVariant] ?? ""
      : "";
    const desktopGridTemplate = RAW_GRID_TEMPLATE[resolvedVariant] ?? "";
    const responsiveTemplateStyle: React.CSSProperties | null = resolvedMobileVariant
      ? ({
          ["--np-mobile-template" as string]: mobileGridTemplate,
          ["--np-desktop-template" as string]: desktopGridTemplate,
        } as React.CSSProperties)
      : null;
    const outerLayoutClass = responsiveTemplateStyle
      ? "np-layout-responsive"
      : isGridVariant
        ? `grid ${gridTemplateClass} ${stackGapClass}`.trim()
        : isStack
          ? `flex flex-col md:flex-row ${stackGapClass}`.trim()
          : isBar
            ? "flex gap-2 md:gap-0"
            : "flex";
    // Visibility — the centralised `withVisibilityProps` decorator in
    // `@core/blocks/registry.ts` wraps the public render with the right
    // hide classes. Per-block-editor cues (e.g. the amber tint in the
    // theme builder branch below) stay local. `visibilityClass` is now
    // empty for all paths so we don't double-wrap on public.
    const visibilityClass = "";
    // Per-column mobile order — when `resolvedMobileColOrder` is set,
    // emit `order-N md:order-K` on EVERY column so unmoved columns
    // also have an explicit order. Otherwise un-classed columns default
    // to `order: 0` and bunch up with each other instead of holding
    // their position relative to the reordered ones.
    const orderClassFor = (i: number): string => {
      if (!resolvedMobileColOrder) return "";
      // The user's array is "for position P, show source column S".
      // For source column i we want the inverse: "what position does
      // it occupy on mobile?".
      const mobilePosition = resolvedMobileColOrder.indexOf(i);
      if (mobilePosition < 0) return "";
      return `${ORDER_AT_MOBILE[mobilePosition] ?? ""} ${ORDER_AT_DESKTOP[i] ?? ""}`.trim();
    };
    const colWidthClassFor = (i: number): string => {
      // When mobileVariant is in effect, the responsive grid wrapper
      // does all column sizing — no per-column width classes needed.
      // The "max" column still needs `w-full min-w-0` if EITHER variant
      // is a grid variant (the cell would otherwise shrink to content).
      if (responsiveTemplateStyle) {
        const desktopMax = GRID_VARIANT_MAX_COL_INDEX[resolvedVariant];
        const mobileMax = resolvedMobileVariant
          ? GRID_VARIANT_MAX_COL_INDEX[resolvedMobileVariant]
          : undefined;
        if (desktopMax === i || mobileMax === i) return "w-full min-w-0";
        return "";
      }
      if (!isGridVariant) {
        const width =
          colClasses[i] ?? (isStack ? "w-full md:w-1/2" : isBar ? "w-auto md:w-1/2" : "w-1/2");
        // `bar` mode: column 0 pins left (`mr-auto` eats the slack so the
        // rest hug the right edge); columns 1..N reverse below `md` via
        // `order-*`. `md:` resets both so desktop is byte-identical.
        if (!isBar) return width;
        const bar = `${i === 0 ? "mr-auto md:mr-0" : ""} ${BAR_ORDER[count]?.[i] ?? ""}`.trim();
        return `${width} ${bar}`.trim();
      }
      // Grid-template variants: the grid track sizes the column, BUT a
      // flex-col container inside a track without an explicit width can
      // still shrink to its content's natural width — so `items-center`
      // has nothing to center against. Force the flexible (1fr) column
      // to fill its track with `w-full min-w-0` (the `min-w-0` lets the
      // nav wrap / truncate when the track tightens). The intrinsic
      // (`auto`) columns stay free so they hug their content.
      if (GRID_VARIANT_MAX_COL_INDEX[resolvedVariant] === i) return "w-full min-w-0";
      return "";
    };

    const DropZone = puck?.renderDropZone;

    // Inline `marginTop` / `marginBottom` carry the numeric values — Tailwind's
    // JIT can't see arbitrary `mt-[1.25rem]` strings constructed at render time.
    const marginStyle: React.CSSProperties = {
      marginTop: `${marginTopRem ?? 1}rem`,
      marginBottom: `${marginBottomRem ?? 1}rem`,
    };

    // Band styling — background / hairline borders / inner padding wrap
    // the column flex/grid in a styled div. Empty / zero values opt out;
    // the band wrapper is only emitted when at least one prop is set, so
    // the no-band case renders the exact DOM it did before.
    const HEX_RE = /^#[0-9a-fA-F]{6}$/;
    const sanitizeHex = (v: string | undefined): string =>
      typeof v === "string" && HEX_RE.test(v) ? v : "";
    const bg = sanitizeHex(bgColor);
    const bt = sanitizeHex(borderTopColor);
    const bb = sanitizeHex(borderBottomColor);
    const pt = typeof paddingTopRem === "number" && paddingTopRem > 0 ? paddingTopRem : 0;
    const pb = typeof paddingBottomRem === "number" && paddingBottomRem > 0 ? paddingBottomRem : 0;
    const hasBand = !!(bg || bt || bb || pt || pb);
    const bandStyle: React.CSSProperties = hasBand
      ? {
          backgroundColor: bg || undefined,
          borderTop: bt ? `1px solid ${bt}` : undefined,
          borderBottom: bb ? `1px solid ${bb}` : undefined,
          paddingTop: pt ? `${pt}rem` : undefined,
          paddingBottom: pb ? `${pb}rem` : undefined,
        }
      : {};
    const wrapInBand = (inner: React.ReactNode): React.ReactNode =>
      hasBand ? (
        <div className="np-layout-band" style={bandStyle}>
          {inner}
        </div>
      ) : (
        inner
      );

    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };

    // Theme builder: schematic preview with explicit chrome — outer card
    // labels the variant + margins, each column has a labelled drop area
    // with a high `minEmptyHeight` so empty zones are obviously droppable.
    if (puck?.isEditing && md.themeBuilder) {
      // Theme builder shows the block regardless of `hideOn*` so the
      // user can still edit a "hidden on mobile" block. To make it
      // obvious the toggle IS taking effect on the live site, the
      // block is dimmed + tinted amber while hidden, and an explicit
      // amber pill calls out the active visibility state.
      const isAnyHidden = hideOnMobile || hideOnDesktop;
      const visTag =
        hideOnMobile && hideOnDesktop
          ? "Hidden on both breakpoints"
          : hideOnMobile
            ? "Hidden on mobile (< 768px)"
            : hideOnDesktop
              ? "Hidden on desktop (≥ 768px)"
              : "";
      const mvTag = resolvedMobileVariant ? ` · mobile: ${resolvedMobileVariant}` : "";
      const ordTag = resolvedMobileColOrder ? ` · mobile order: ${resolvedMobileColOrder.map((n) => n + 1).join(",")}` : "";
      return (
        <div
          className={`not-prose rounded-lg border-2 border-dashed p-2 ${
            isAnyHidden
              ? "border-amber-400/60 bg-amber-50/40 opacity-60"
              : "border-sky-400/50 bg-sky-50/40"
          }`.trim()}
          style={marginStyle}
        >
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${isAnyHidden ? "text-amber-700" : "text-sky-700"}`}>
              Layout · {resolvedVariant} · top {marginTopRem ?? 1}rem · bottom {marginBottomRem ?? 1}rem{mvTag}{ordTag}
            </span>
            {visTag ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 border border-amber-300">
                {visTag}
              </span>
            ) : null}
          </div>
          {wrapInBand(
            <div
              className={`${outerLayoutClass} gap-2`}
              style={responsiveTemplateStyle ?? undefined}
            >
              {Array.from({ length: count }).map((_, i) => {
                const zoneName = ZONE_NAMES[i] as ZoneName;
                const align = colProps[i] ?? DEFAULT_ALIGN;
                const { hClass, vClass } = colAlignClasses(align);
                const padRaw = colPadding[i];
                const padCss = paddingStyle(padRaw);
                const padSummary = padSummaryLabel(padRaw);
                const colClass = colWidthClassFor(i);
                const orderClass = orderClassFor(i);
                const mobileHClass = mobileHClassFor(colMobileAlign[i]);
                return (
                  <div
                    key={zoneName}
                    className={`${colClass} ${orderClass} flex flex-col rounded border border-dashed border-sky-300 bg-white/60 p-1`.trim()}
                  >
                    <div className="mb-0.5 text-[10px] text-slate-400 pl-0.5">
                      {labels[i] ?? `Col ${i + 1}`}{padSummary ? ` · ${padSummary}` : ""}
                    </div>
                    <div
                      className={`flex flex-1 flex-col ${hClass} ${vClass} ${mobileHClass}`.trim()}
                      style={padCss}
                    >
                      {DropZone ? (
                        <DropZone zone={zoneName} allow={allow} minEmptyHeight={80} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Page / post editor: render close to public so the canvas reflects
    // what readers see. Each column gets a subtle slate dashed outline so
    // empty drop zones are still visible (matches the Spacer block's
    // page-editor convention). No outer card chrome, no per-column labels.
    if (puck?.isEditing) {
      const columns = Array.from({ length: count }).map((_, i) => {
        const zoneName = ZONE_NAMES[i] as ZoneName;
        const align = colProps[i] ?? DEFAULT_ALIGN;
        const { hClass, vClass } = colAlignClasses(align);
        const padCss = paddingStyle(colPadding[i]);
        const colClass = colWidthClassFor(i);
        const orderClass = orderClassFor(i);
        const mobileHClass = mobileHClassFor(colMobileAlign[i]);
        return (
          <div
            key={zoneName}
            className={`${colClass} ${orderClass} flex flex-col rounded border border-dashed border-slate-300 ${hClass} ${vClass} ${mobileHClass}`.trim()}
            style={padCss}
          >
            {DropZone ? (
              <DropZone zone={zoneName} allow={allow} minEmptyHeight={60} />
            ) : null}
          </div>
        );
      });
      if (hasBand) {
        return (
          <div className={`np-layout-band ${visibilityClass}`.trim()} style={{ ...marginStyle, ...bandStyle }}>
            <div
              className={`not-prose ${outerLayoutClass} w-full`}
              style={responsiveTemplateStyle ?? undefined}
            >
              {columns}
            </div>
          </div>
        );
      }
      return (
        <div
          className={`not-prose ${outerLayoutClass} w-full ${visibilityClass}`.trim()}
          style={{ ...marginStyle, ...(responsiveTemplateStyle ?? {}) }}
        >
          {columns}
        </div>
      );
    }

    // Public render: full-width row — flex for fraction variants, grid
    // for grid-template variants (auto+max+auto).
    const publicColumns = Array.from({ length: count }).map((_, i) => {
      const zoneName = ZONE_NAMES[i] as ZoneName;
      const align = colProps[i] ?? DEFAULT_ALIGN;
      const { hClass, vClass } = colAlignClasses(align);
      const padCss = paddingStyle(colPadding[i]);
      const colClass = colWidthClassFor(i);
      const orderClass = orderClassFor(i);
      const mobileHClass = mobileHClassFor(colMobileAlign[i]);
      return (
        <div
          key={zoneName}
          className={`${colClass} ${orderClass} flex flex-col ${hClass} ${vClass} ${mobileHClass}`.trim()}
          style={padCss}
        >
          {DropZone ? <DropZone zone={zoneName} allow={allow} /> : null}
        </div>
      );
    });
    if (hasBand) {
      return (
        <div className={`np-layout-band ${visibilityClass}`.trim()} style={{ ...marginStyle, ...bandStyle }}>
          <div
            className={`np-layout not-prose ${outerLayoutClass} w-full`}
            style={responsiveTemplateStyle ?? undefined}
          >
            {publicColumns}
          </div>
        </div>
      );
    }
    return (
      <div
        className={`np-layout not-prose ${outerLayoutClass} w-full ${visibilityClass}`.trim()}
        style={{ ...marginStyle, ...(responsiveTemplateStyle ?? {}) }}
      >
        {publicColumns}
      </div>
    );
  },
};

export const LayoutBlock: Omit<RegisteredBlock, "source"> = {
  name: "Layout",
  config: Layout,
  // All template surfaces + page-content + post-content + sidebars +
  // footer — mirrors the Spacer block's surface list exactly so the
  // Layout widget is available everywhere a general-purpose block can go.
  surfaces: [
    "page-content",
    "post-content",
    "header",
    "footer",
    "sidebar",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-not-found",
    "template-author",
    "template-search-results",
  ],
  category: "Layout",
};
