/**
 * Filter declarations for the theme render path.
 *
 * Plugins that contribute render-time data to the public theme
 * register via `api.hooks.filter("theme.metadata", handler)`. The
 * filter receives a namespaced map (`Record<string, unknown>`); the
 * convention is for each plugin to namespace its data under its
 * own slug:
 *
 *   api.hooks.filter("theme.metadata", async ({ value, ctx }) => ({
 *     ...value,
 *     "my-plugin": { ...await myPluginFetch(ctx) },
 *   }));
 *
 * The result lands under `metadata.plugins` in `renderActiveTheme`
 * and is delivered to Puck blocks as
 * `puck.metadata.plugins["<slug>"]`. See
 * `development_docs/plans/2026-05-09-plugin-theme-widgets.md`.
 *
 * The ctx exposes the full ActiveThemeContext plus the flat list of
 * Puck trees being rendered on this route (header / footer / left /
 * right sidebar / template main). Plugins that need to find their
 * own blocks for SSR prefetch walk these trees with `forEachBlock`
 * — same pattern the engine uses internally for PostsGrid and
 * Newspaper spec collection.
 */
import type { Data } from "@measured/puck";
import type { ActiveThemeContext } from "./render";

export interface ThemeMetadataContext extends ActiveThemeContext {
  /** All Puck trees being rendered on this route. Plugins walk these
   *  with `forEachBlock` to find their blocks for SSR prefetch. */
  trees: readonly Data[];
}

declare module "@core/hooks/types" {
  interface FilterMap {
    "theme.metadata": {
      value: Record<string, unknown>;
      ctx: ThemeMetadataContext;
    };
  }
}

// `export {}` keeps this file a module so the `declare module` is
// a module augmentation and not an ambient declaration.
export {};
