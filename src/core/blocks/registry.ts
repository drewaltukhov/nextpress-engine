/**
 * Cross-surface block registry.
 *
 * The same Puck-style component can show up in multiple editing surfaces —
 * the Page editor, the Post editor (later), and theme builder surfaces
 * (Header, Footer, Sidebar parts; Single Page / Single Post / Topic Archive
 * / 404 template inner zones). Rather than maintain a separate
 * `puckConfig` per surface, every block declares which surfaces it's
 * allowed in. Each editor calls `buildPuckConfigForSurface(surface)` to
 * get a Puck `Config` filtered to just that surface's components.
 *
 * Registration is a side-effect performed by importing modules — the
 * Pages plugin registers its core blocks at module load, and themes /
 * other plugins do the same when their entry modules are evaluated.
 *
 * See `development_docs/plans/2026-05-07-themes-and-menus.md` §3 for the
 * surface taxonomy and the larger themes-and-menus plan this registry
 * unblocks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// `ComponentConfig<any>` is necessary because the registry holds blocks
// with heterogeneous prop types and Puck's own `Config["components"]`
// uses `any` per-key for the same reason.
import type { ComponentConfig, Config } from "@measured/puck";
import { createElement } from "react";

export type Surface =
  | "page-content"
  | "post-content"
  | "header"
  | "footer"
  | "sidebar"
  | "template-homepage"
  | "template-single-page"
  | "template-single-post"
  | "template-single-pillar"
  | "template-topic-archive"
  | "template-not-found"
  | "template-search-results"
  | "template-author";

export interface RegisteredBlock {
  /** Unique across the system; this is the value Puck stores as `block.type`
   *  in saved puckData, so renaming a block is a breaking change for any
   *  content that references it. */
  name: string;
  /** Standard Puck `ComponentConfig`; the registry doesn't transform it. */
  config: ComponentConfig<any>;
  /** Surfaces this block may be dropped into. The editor for a given
   *  surface filters to blocks where `surfaces.includes(surface)`. */
  surfaces: readonly Surface[];
  /** Left-rail group the block appears under in editors. Insertion order
   *  of categories follows the first registration that uses each label. */
  category: string;
  /** `'core'` for built-in blocks; `'plugin:<slug>'` / `'theme:<slug>'`
   *  when added by a plugin or theme. Used in the admin UI to label a
   *  block's origin. */
  source: string;
  /** Singleton / required block. Hidden from the widgets library and
   *  excluded from DropZone `allow` lists, but still present in
   *  `config.components` so saved data continues to render. The block's
   *  ComponentConfig should ALSO set `permissions: { delete: false,
   *  duplicate: false }` to hide Puck's per-instance toolbar actions —
   *  the registry flag controls library visibility, the config
   *  controls instance actions. Both pieces are needed. */
  essential?: boolean;
  /** Allow at most one instance per zone. The widgets rail still shows
   *  the block, but the schematic's DropZone `allow` list excludes it
   *  once an instance lives in the zone — preventing e.g. two Author
   *  Avatars on the same author page. Different from `essential`:
   *  singleton blocks are still user-droppable and user-deletable. */
  singleton?: boolean;
  /** Optional SVG path data (the same shape `plugin.json`'s `admin.icon`
   *  uses) for the widget-rail entry's leading icon. When present, the
   *  theme builder renders an inline 24×24 stroked SVG for this block;
   *  when absent, it falls back to the hardcoded Lucide map and finally
   *  to a placeholder. Plugins typically import their `plugin.json` and
   *  pass `manifest.admin.icon` so the rail icon matches the admin nav. */
  icon?: string;
}

// Pin the registry to globalThis so Turbopack hot-reload re-evaluation
// doesn't drop registered blocks between boot and the next request.
// Module-level Maps get re-created when next/turbopack re-evaluates this
// file in dev, which empties the registry and causes Puck Render to silently
// skip all blocks (returning null per-item). Same pattern as the settings
// registry in src/core-plugins/settings/registry.ts.
const REGISTRY_KEY = "__nextpress_block_registry__" as const;

function registry(): Map<string, RegisteredBlock> {
  const g = globalThis as unknown as Record<string, Map<string, RegisteredBlock> | undefined>;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
  return g[REGISTRY_KEY]!;
}

/**
 * Register a block. Re-registering the same name overwrites the previous
 * entry (Next.js dev HMR re-evaluates modules; warning would be noise).
 *
 * Defends against partial / undefined block exports (a transitive import
 * failure or a stale HMR pass can leave a `*Block` named export as
 * `undefined`; spreading that produces `{ source }` with no `surfaces`,
 * which then crashes `getBlocksForSurface`). We warn and skip rather
 * than poisoning the registry.
 */
export function registerBlock(block: RegisteredBlock): void {
  if (!block || typeof block !== "object" || !block.name || !Array.isArray(block.surfaces)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[registerBlock] skipping malformed block — likely a failed import or stale HMR state.",
        block,
      );
    }
    return;
  }
  registry().set(block.name, block);
}

/**
 * Explicit category priority. The widget rail in the theme/page
 * builder groups blocks by category and renders categories in the
 * order each one's first block appears in our sorted list. Without an
 * explicit ranking, the alphabetically-earliest block on a given
 * surface decides which group shows first — that means "Media" leads
 * on single-page templates (because `Banner` < `Breadcrumbs`),
 * "Sections" leads on single-post, etc. Ranking categories here keeps
 * "Template" first across every surface so the content-shaped widgets
 * are always the first thing an editor sees. Unranked categories fall
 * through to the alphabetical tail.
 */
const CATEGORY_ORDER: readonly string[] = [
  "Template",
  "Sections",
  "Newspaper",
  "Media",
  "Text",
  "Layout",
  "Site",
];

function categoryRank(category: string): number {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

/**
 * Stable cross-environment ordering. Insertion order is unreliable
 * because the SAME registry can be populated from different module
 * graphs on the server (renderActiveTheme path, page editor path,
 * post editor path) versus the client (theme builder bundle, page
 * editor bundle). When the iteration order diverges, Puck's editor
 * shows the widget rail in different sequences for SSR vs CSR and
 * React throws a hydration mismatch at <Puck.Components />.
 *
 * Sorting by `(source, categoryRank, category, name)` produces the
 * same iteration order on every code path:
 *   - `core` blocks sort before `plugin:*` and `theme:*`.
 *   - Within a source, blocks group by ranked category — Template
 *     first, Site last among the named groups; unknown categories
 *     tail-sort alphabetically.
 *   - Within a category, blocks sort by name.
 */
function compareBlocks(a: RegisteredBlock, b: RegisteredBlock): number {
  const bySource = a.source.localeCompare(b.source);
  if (bySource !== 0) return bySource;
  const byCategoryRank = categoryRank(a.category) - categoryRank(b.category);
  if (byCategoryRank !== 0) return byCategoryRank;
  const byCategory = a.category.localeCompare(b.category);
  if (byCategory !== 0) return byCategory;
  return a.name.localeCompare(b.name);
}

export function getBlocksForSurface(surface: Surface): RegisteredBlock[] {
  // `Array.isArray(b.surfaces)` is belt-and-braces against malformed
  // entries — `registerBlock` already filters these out, but a stale
  // registry from an earlier HMR pass could still hold a bad entry.
  return Array.from(registry().values())
    .filter((b) => Array.isArray(b.surfaces) && b.surfaces.includes(surface))
    .sort(compareBlocks);
}

export function listAllBlocks(): RegisteredBlock[] {
  return Array.from(registry().values()).sort(compareBlocks);
}

/**
 * Build a Puck `Config` whose `components` and `categories` are filtered
 * to the given surface. Category order follows the first registration
 * that introduces each label; component order within a category follows
 * registration order. The empty `root.fields` object suppresses Puck's
 * built-in `title` field from showing in the inspector when nothing is
 * selected (sidebar inspector mode shows the panel always).
 */
/**
 * Decorate any block's `ComponentConfig` with three universal fields —
 * `hideOnMobile`, `hideOnDesktop`, and `customClassName` — plus a
 * render wrapper that applies `max-md:hidden` / `md:hidden` and the
 * user-supplied class to the block's output.
 *
 * Applied once at Puck-config-build time so every block (current and
 * future, core or plugin) picks it up without per-widget edits. The
 * extra wrapper `<div>` is only emitted when at least one toggle is on
 * or a custom class is set — un-decorated blocks render byte-identical
 * to before.
 *
 * Idempotent: if the block already declares any of these props in its
 * `fields` (e.g. an older Layout block did this directly), we still
 * inject our standard versions — both end up setting the same prop on
 * the same field type, so the wrapper still works. Render-side,
 * double application is harmless: `max-md:hidden` cascading over
 * `max-md:hidden` collapses to one rule.
 */
function withVisibilityProps(config: ComponentConfig<any>): ComponentConfig<any> {
  const SHOW_HIDE_OPTIONS = [
    { label: "Show", value: false },
    { label: "Hide", value: true },
  ];
  const visibilityFields = {
    hideOnMobile: {
      type: "radio" as const,
      label: "Hide on mobile (below 768px)",
      options: SHOW_HIDE_OPTIONS,
    },
    hideOnDesktop: {
      type: "radio" as const,
      label: "Hide on desktop (768px+)",
      options: SHOW_HIDE_OPTIONS,
    },
    customClassName: {
      type: "text" as const,
      label: "Custom class name",
    },
  };
  const originalRender = config.render;
  const originalResolveData = config.resolveData;
  return {
    ...config,
    fields: {
      ...(config.fields ?? {}),
      ...visibilityFields,
    } as ComponentConfig<any>["fields"],
    defaultProps: {
      ...((config.defaultProps as Record<string, unknown>) ?? {}),
      hideOnMobile: false,
      hideOnDesktop: false,
      customClassName: "",
    } as ComponentConfig<any>["defaultProps"],
    // Backfill the universal props on load so blocks saved before
    // the decorator existed render with "Show / Show" selected in
    // the inspector instead of an ambiguous blank radio, and the
    // custom-class field shows as empty rather than `undefined`. Wraps
    // any existing `resolveData` the original block declared.
    resolveData: (async (data: any, params: any) => {
      const base = originalResolveData
        ? await originalResolveData(data, params)
        : data;
      const baseProps = (base?.props ?? {}) as Record<string, unknown>;
      return {
        ...base,
        props: {
          ...baseProps,
          hideOnMobile: baseProps.hideOnMobile ?? false,
          hideOnDesktop: baseProps.hideOnDesktop ?? false,
          customClassName: baseProps.customClassName ?? "",
        },
      };
    }) as ComponentConfig<any>["resolveData"],
    render: ((props: any) => {
      const hideMobile = props?.hideOnMobile === true;
      const hideDesktop = props?.hideOnDesktop === true;
      const customClass =
        typeof props?.customClassName === "string"
          ? props.customClassName.trim()
          : "";
      const isEditing = props?.puck?.isEditing === true;
      const rendered = originalRender(props);
      // Skip the hide wrapper in any editor mode — display:none on the
      // block makes it impossible to click/edit. The custom class
      // still applies in editor so authors see their styling as they
      // work; only the breakpoint hide rules are deferred to public.
      if (isEditing) {
        if (customClass === "") return rendered;
        return createElement("div", { className: customClass }, rendered);
      }
      if (!hideMobile && !hideDesktop && customClass === "") return rendered;
      const cls = [
        hideMobile ? "max-md:hidden" : "",
        hideDesktop ? "md:hidden" : "",
        customClass,
      ]
        .filter(Boolean)
        .join(" ");
      return createElement("div", { className: cls }, rendered);
    }) as ComponentConfig<any>["render"],
  };
}

/**
 * Wrap every block's config in `withVisibilityProps` so each one
 * exposes the universal hide-on-mobile / hide-on-desktop toggles in
 * its Puck inspector. Centralised here so adding a new block doesn't
 * mean repeating the boilerplate.
 *
 * Exported because not all Puck configs flow through this file's
 * `buildPuckConfig*` builders — the theme builder, for one, assembles
 * its own components map inline. Those call sites need to invoke this
 * helper directly so their blocks pick up the toggles too.
 */
export function decorateComponents(
  components: Record<string, ComponentConfig<any>>,
): Record<string, ComponentConfig<any>> {
  const out: Record<string, ComponentConfig<any>> = {};
  for (const [name, cfg] of Object.entries(components)) {
    out[name] = withVisibilityProps(cfg);
  }
  return out;
}

export function buildPuckConfigForSurface(surface: Surface): Config {
  const blocks = getBlocksForSurface(surface);
  const components: Record<string, ComponentConfig<any>> = {};
  const categories = new Map<string, { title: string; components: string[] }>();

  for (const block of blocks) {
    components[block.name] = block.config;
    const key = block.category.toLowerCase();
    let cat = categories.get(key);
    if (!cat) {
      cat = { title: block.category, components: [] };
      categories.set(key, cat);
    }
    cat.components.push(block.name);
  }

  return {
    root: { fields: {} },
    components: decorateComponents(components) as Config["components"],
    categories: Object.fromEntries(categories) as Config["categories"],
  };
}

/**
 * Build a Puck `Config` filtered to an explicit list of block names.
 * Blocks not currently registered are silently skipped — the consumer's
 * import side-effects are responsible for ensuring registration happens
 * before this is called.
 *
 * Used when an editor wants a curated subset of the registry that doesn't
 * fit cleanly into the `Surface` taxonomy — e.g. the Mega Menu plugin's
 * panel editor reuses ~12 blocks from `pages/blocks` and `site-widgets`
 * without those blocks needing to opt into a new surface. Pass
 * `categoryOverride` to remap an individual block's category label for
 * the curated palette.
 */
export function buildPuckConfigFromBlockNames(
  names: readonly string[],
  options: { categoryOverride?: Record<string, string> } = {},
): Config {
  const reg = registry();
  const blocks = names
    .map((n) => reg.get(n))
    .filter((b): b is RegisteredBlock => b !== undefined);
  const components: Record<string, ComponentConfig<any>> = {};
  const categories = new Map<string, { title: string; components: string[] }>();

  for (const block of blocks) {
    components[block.name] = block.config;
    const label = options.categoryOverride?.[block.name] ?? block.category;
    const key = label.toLowerCase();
    let cat = categories.get(key);
    if (!cat) {
      cat = { title: label, components: [] };
      categories.set(key, cat);
    }
    cat.components.push(block.name);
  }

  return {
    root: { fields: {} },
    components: decorateComponents(components) as Config["components"],
    categories: Object.fromEntries(categories) as Config["categories"],
  };
}

/**
 * Build a Puck `Config` whose `components` and `categories` include
 * every block currently registered, regardless of surface. The
 * cross-surface block registry is the only place that knows about
 * theme blocks (registered on boot) and plugin blocks (registered
 * during their `register(api)` calls); the surface-filtered configs
 * exported by individual editors miss those.
 *
 * Used by the public theme renderer (`renderActiveTheme`) which has
 * to render mixed-surface trees (Header / footer parts contain
 * `Layout` + `SiteLogo` / `NavMenu` / `SearchBox` blocks, template
 * inner zones contain `PageContent` / `PostContent` blocks, sidebars
 * contain `NavMenu` / `PostsGrid` / `SearchBox` blocks,
 * etc.). Surface filtering is an editor-side concept; rendering needs
 * to resolve any block by name.
 */
export function buildPuckConfigFromAllRegistered(): Config {
  const blocks = listAllBlocks();
  const components: Record<string, ComponentConfig<any>> = {};
  const categories = new Map<string, { title: string; components: string[] }>();

  for (const block of blocks) {
    components[block.name] = block.config;
    const key = block.category.toLowerCase();
    let cat = categories.get(key);
    if (!cat) {
      cat = { title: block.category, components: [] };
      categories.set(key, cat);
    }
    cat.components.push(block.name);
  }

  return {
    root: { fields: {} },
    components: decorateComponents(components) as Config["components"],
    categories: Object.fromEntries(categories) as Config["categories"],
  };
}
