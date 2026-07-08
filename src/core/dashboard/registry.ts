/**
 * Dashboard widget registry.
 *
 * Plugins call `registerDashboardWidget()` from their register() hook to
 * surface a widget on the user dashboard. Built-in widgets (Weather is
 * a plugin; Core Engine is internal) register the same way so the
 * dashboard renderer doesn't special-case anyone.
 *
 * Pinned to globalThis so Turbopack hot-reload doesn't drop registrations
 * between boot and the next server-action call. Same pattern as the
 * settings registry and the DB singleton.
 */
import type { ComponentType } from "react";
import type { DbClient } from "@core/db/client";

export interface WidgetSize {
  w: number; // 1..12 columns on a 12-col grid
  h: number; // row units (RGL row height in pixels is set in the grid)
}

/**
 * Bounds for resize. Either dimension can be omitted to skip that
 * constraint — the grid wrapper falls back to its hardcoded defaults
 * (1..12 cols wide, 1..50 rows tall).
 */
export interface WidgetSizeBounds {
  w?: number;
  h?: number;
}

export interface WidgetFetchContext {
  db: DbClient;
  userId: string | null;
}

export interface DashboardWidget<TData = unknown> {
  /** Globally unique slug, conventionally `<plugin>.<name>` (e.g. `weather.current`). */
  slug: string;
  /** Plugin slug that owns this widget — used for filtering enabled-widget list. */
  source: string;
  /** Short human title — shown in the widget header. */
  title: string;
  /** Initial size when the user has no saved layout. RGL clamps to grid. */
  defaultSize: WidgetSize;
  /** Resize bounds. `w` clamped to [1,12]. Either field on either bound
   *  may be omitted to skip that constraint (grid defaults take over). */
  minSize?: WidgetSizeBounds;
  maxSize?: WidgetSizeBounds;
  /**
   * Optional server-side data fetcher. Runs in parallel with all other
   * widgets' fetchers during page render. The resolved value is passed
   * to `Component` as the `data` prop.
   */
  fetch?: (ctx: WidgetFetchContext) => Promise<TData>;
  /** Render component. Receives `{ data }` from `fetch()`, or `undefined` if no fetch. */
  Component: ComponentType<{ data: TData }>;
  /**
   * Optional component rendered right-aligned in the widget's title row.
   * Use for affordances like a manual refresh icon, "open settings" link, etc.
   * Anything inside is excluded from the drag-handle so click events don't
   * bubble into the grid's drag detection.
   */
  HeaderActions?: ComponentType;
}

const REGISTRY_KEY = "__nextpress_dashboard_widgets__" as const;

function registry(): Map<string, DashboardWidget<unknown>> {
  const g = globalThis as unknown as Record<string, Map<string, DashboardWidget<unknown>> | undefined>;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
  return g[REGISTRY_KEY]!;
}

/**
 * Register a dashboard widget. Idempotent — a second call with the
 * same slug overwrites the prior registration (so plugin hot-reload
 * works in dev).
 */
export function registerDashboardWidget<T>(widget: DashboardWidget<T>): void {
  registry().set(widget.slug, widget as unknown as DashboardWidget<unknown>);
}

/** Look up a registered widget by slug. */
export function getDashboardWidget(slug: string): DashboardWidget<unknown> | undefined {
  return registry().get(slug);
}

/** All registered widgets, in registration order. */
export function listDashboardWidgets(): DashboardWidget<unknown>[] {
  return Array.from(registry().values());
}

/**
 * Drop every widget registered with `source === slug`. Used when a plugin
 * is disabled live so the dashboard stops listing its widgets without a
 * server restart. Safe to call for plugins that registered no widgets.
 */
export function unregisterDashboardWidgetsBySource(slug: string): number {
  const r = registry();
  let removed = 0;
  for (const [key, w] of r) {
    if (w.source === slug) {
      r.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Reset (test-only). */
export function _resetDashboardRegistry(): void {
  registry().clear();
}
