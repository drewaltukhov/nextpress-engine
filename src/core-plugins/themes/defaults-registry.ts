/**
 * In-memory registry of theme defaults. Each theme calls
 * `registerThemeDefaults(slug, defaults)` from its own `register(api)`
 * hook. The themes service reads from here when activating a theme or
 * when the builder's Reset button asks for the canonical default of a
 * given part/template.
 *
 * Defaults live in TypeScript (not SQL migrations) so the Reset action
 * can re-apply them — SQL migrations only run once per install.
 */

/** Parsed Puck `Data` shape: at minimum `{ content: [], root: {} }`,
 *  with optional `zones` for blocks that host nested DropZones (Layout,
 *  StickyContainer). The keys inside `zones` follow Puck's
 *  `<blockId>:<zoneName>` convention. */
export type ThemePuckData = {
  content: unknown[];
  root: Record<string, unknown>;
  zones?: Record<string, unknown[]>;
};

export interface ThemeDefaults {
  parts: Record<string, ThemePuckData>;
  templates: Record<string, ThemePuckData>;
}

const DEFAULTS_KEY = "__nextpress_theme_defaults__" as const;

function store(): Map<string, ThemeDefaults> {
  const g = globalThis as unknown as Record<string, Map<string, ThemeDefaults> | undefined>;
  if (!g[DEFAULTS_KEY]) g[DEFAULTS_KEY] = new Map();
  return g[DEFAULTS_KEY]!;
}

export function registerThemeDefaults(slug: string, defaults: ThemeDefaults): void {
  store().set(slug, defaults);
}

export function getThemeDefaults(slug: string): ThemeDefaults | undefined {
  return store().get(slug);
}
