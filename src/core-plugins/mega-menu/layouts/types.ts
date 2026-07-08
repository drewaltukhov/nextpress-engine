import type { ReactNode } from "react";
import type { DbClient } from "@core/db/client";

/**
 * A LayoutDef is the contract every pre-built mega panel layout
 * implements. The registry (`layouts/index.ts`) holds one entry per
 * layout; the editor picks from these, the public renderer dispatches by
 * `id`. Adding a new layout = drop a new file in `layouts/` and add it
 * to the registry — no migration, no schema change.
 *
 * Type parameter `TConfig` lets each layout define its own config shape.
 * The registry erases TConfig (entries are typed as `LayoutDef<unknown>`)
 * — the layout's own `parseConfig` is the type-safe boundary at the
 * runtime read.
 */
export interface LayoutDef<TConfig> {
  /** Stable id stored in `menu_item_mega_panels.layout_id`. Renaming a
   *  layout's id is a breaking change for any saved panel. */
  id: string;
  /** Human-readable label shown in the picker. */
  name: string;
  /** One-sentence description shown in the picker, beneath the name. */
  description: string;
  /** Inline SVG markup (no XML decl) for the picker thumbnail. Drawn at
   *  the layout's intrinsic ratio; the picker scales to fit. */
  thumbnailSvg: string;
  /** Apply defaults + tolerate stale shapes. Receives whatever JSON the
   *  DB happened to have; returns a fully-defaulted, type-safe config. */
  parseConfig: (raw: unknown) => TConfig;
  /** Server component (or sync function returning ReactNode) that fetches
   *  the layout's data and renders the panel JSX. Receives the live db
   *  client so each layout can compose its own queries — keeps fetching
   *  close to the rendering. */
  Render: (props: { db: DbClient; config: TConfig }) => Promise<ReactNode> | ReactNode;
}
