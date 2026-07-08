import type { LayoutDef } from "./types";
import { editorial } from "./editorial";
import { multiSection } from "./multi-section";
import { showcase } from "./showcase";

/**
 * Layout registry — single source of truth. The editor's picker iterates
 * REGISTRY; the public renderer dispatches by layout_id.
 *
 * Order matters: it's the order users see in the picker. Put the most
 * commonly useful first.
 *
 * Adding a new layout: drop a file in this directory and add it here.
 * No migration, no schema change — `layout_id` is a free-form text
 * column that just needs to match an entry id.
 */
export const REGISTRY: ReadonlyArray<LayoutDef<unknown>> = [
  editorial as LayoutDef<unknown>,
  multiSection as LayoutDef<unknown>,
  showcase as LayoutDef<unknown>,
];

/** Lookup by id; returns null when the saved layout_id no longer exists
 *  (e.g. a layout was renamed/removed). Caller decides how to fall back. */
export function getLayout(id: string): LayoutDef<unknown> | null {
  return REGISTRY.find((l) => l.id === id) ?? null;
}

export type WidthMode = "full" | "container";

export const WIDTH_MODES: ReadonlyArray<{ value: WidthMode; label: string; help: string }> = [
  { value: "full", label: "Full screen width", help: "Panel spans 100% of the viewport, breaking out of the nav's container." },
  { value: "container", label: "Container width", help: "Panel aligned to the theme's container max-width — same edges as the nav itself." },
];

export type { LayoutDef } from "./types";
export type { EditorialConfig } from "./editorial";
export type { MultiSectionConfig } from "./multi-section";
export type { ShowcaseConfig } from "./showcase";
