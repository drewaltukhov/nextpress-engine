/**
 * Theme layout vocabulary — column presets and container width options
 * shared by the settings registry, the public renderer, and the theme
 * settings admin UI.
 *
 * Tailwind purge note: every class string a theme can produce at runtime
 * appears here as a literal. Do not concatenate fragments at runtime,
 * or the JIT will not see the class and the resulting markup will fall
 * back to unstyled.
 */

export const COLUMN_PRESETS = ["1/4-1/2-1/4", "1/3-1/3-1/3"] as const;
export type ColumnPreset = (typeof COLUMN_PRESETS)[number];

export const COLUMN_PRESET_LABELS: Record<ColumnPreset, string> = {
  "1/4-1/2-1/4": "1/4 + 1/2 + 1/4",
  "1/3-1/3-1/3": "1/3 + 1/3 + 1/3",
};

export const DEFAULT_COLUMN_PRESET: ColumnPreset = "1/4-1/2-1/4";

export const CONTAINER_WIDTH_MODES = ["fluid", "preset", "custom"] as const;
export type ContainerWidthMode = (typeof CONTAINER_WIDTH_MODES)[number];

export const CONTAINER_WIDTH_MODE_LABELS: Record<ContainerWidthMode, string> = {
  fluid: "Fluid (full width)",
  preset: "Tailwind preset",
  custom: "Custom width",
};

export const DEFAULT_CONTAINER_WIDTH_MODE: ContainerWidthMode = "preset";

export const CONTAINER_WIDTH_PRESETS = [
  "max-w-3xl",
  "max-w-4xl",
  "max-w-5xl",
  "max-w-6xl",
  "max-w-7xl",
  "max-w-screen-2xl",
  "max-w-full",
] as const;
export type ContainerWidthPreset = (typeof CONTAINER_WIDTH_PRESETS)[number];

export const CONTAINER_WIDTH_PRESET_LABELS: Record<ContainerWidthPreset, string> = {
  "max-w-3xl": "max-w-3xl (48rem)",
  "max-w-4xl": "max-w-4xl (56rem)",
  "max-w-5xl": "max-w-5xl (64rem)",
  "max-w-6xl": "max-w-6xl (72rem)",
  "max-w-7xl": "max-w-7xl (80rem)",
  "max-w-screen-2xl": "max-w-screen-2xl (96rem)",
  "max-w-full": "max-w-full (100%)",
};

export const DEFAULT_CONTAINER_WIDTH_PRESET: ContainerWidthPreset = "max-w-7xl";

export const DEFAULT_CONTAINER_WIDTH_CUSTOM = "1280px";

interface GridSpec {
  /** Outer grid class — e.g. `lg:grid-cols-4`. */
  gridColsClass: string;
  /** Span of one sidebar column — e.g. `lg:col-span-1`. */
  sidebarColSpanClass: string;
  /** Span of the main zone for each sidebar configuration. */
  mainSpan: {
    both: string;
    oneSide: string;
    none: string;
    /** Stretch main to fill the entire row. */
    full: string;
  };
}

// `none` includes `lg:col-start-2` so the main zone sits in the
// middle column(s) instead of clinging to col-start-1 when both
// sidebars are hidden but expand-when-no-sidebars is off. The other
// configurations rely on CSS grid auto-placement (left sidebar lands
// at col 1, main flows after it; right sidebar lands at the last col,
// main fills before it) so they don't need an explicit col-start.
const GRID_SPEC: Record<ColumnPreset, GridSpec> = {
  "1/4-1/2-1/4": {
    gridColsClass: "lg:grid-cols-4",
    sidebarColSpanClass: "lg:col-span-1",
    mainSpan: {
      both: "lg:col-span-2",
      oneSide: "lg:col-span-3",
      none: "lg:col-span-2 lg:col-start-2",
      full: "lg:col-span-4",
    },
  },
  "1/3-1/3-1/3": {
    gridColsClass: "lg:grid-cols-3",
    sidebarColSpanClass: "lg:col-span-1",
    mainSpan: {
      both: "lg:col-span-1",
      oneSide: "lg:col-span-2",
      none: "lg:col-span-1 lg:col-start-2",
      full: "lg:col-span-3",
    },
  },
};

export interface GridClassesArgs {
  preset: ColumnPreset;
  hasLeft: boolean;
  hasRight: boolean;
  expandWhenNoSidebars: boolean;
}

export interface GridClasses {
  gridColsClass: string;
  sidebarColSpanClass: string;
  mainColSpanClass: string;
}

/**
 * Compute grid + column-span classes for the public renderer.
 *
 * - When both sidebars are visible, main takes the preset's "both" span.
 * - When exactly one sidebar is visible, main takes the "oneSide" span.
 * - When no sidebars are visible:
 *     - If `expandWhenNoSidebars` is true (default), main fills the row.
 *     - Otherwise, main stays at its preset width and leaves empty
 *       columns to either side, matching the chosen ratio exactly.
 */
export function computeGridClasses(args: GridClassesArgs): GridClasses {
  const spec = GRID_SPEC[args.preset];
  let main: string;
  if (args.hasLeft && args.hasRight) {
    main = spec.mainSpan.both;
  } else if (args.hasLeft || args.hasRight) {
    main = spec.mainSpan.oneSide;
  } else {
    main = args.expandWhenNoSidebars ? spec.mainSpan.full : spec.mainSpan.none;
  }
  return {
    gridColsClass: spec.gridColsClass,
    sidebarColSpanClass: spec.sidebarColSpanClass,
    mainColSpanClass: main,
  };
}

export interface ContainerStyleArgs {
  mode: ContainerWidthMode;
  preset: ContainerWidthPreset;
  custom: string;
}

export interface ContainerStyle {
  /** Tailwind class for the container constraint, or empty string. */
  className: string;
  /** Inline `max-width` style, or undefined. */
  inlineStyle?: { maxWidth: string };
}

/**
 * Translate the three width-mode settings into a class + optional
 * inline style. Custom mode uses inline style because the value is
 * arbitrary user input (any CSS length); preset mode uses a class so
 * Tailwind's responsive breakpoints stay live.
 */
export function computeContainerStyle(args: ContainerStyleArgs): ContainerStyle {
  if (args.mode === "fluid") return { className: "" };
  if (args.mode === "custom") {
    const trimmed = args.custom.trim();
    return trimmed
      ? { className: "", inlineStyle: { maxWidth: trimmed } }
      : { className: "" };
  }
  return { className: args.preset };
}
