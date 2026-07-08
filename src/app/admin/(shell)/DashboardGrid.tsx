"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import { saveDashboardLayoutAction } from "./dashboard-actions";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// react-grid-layout uses an `export =` namespace style that doesn't play
// well with named imports — pull the helper + type off the default.
type Layout = GridLayout.Layout;
const ResponsiveGrid = GridLayout.WidthProvider(GridLayout);

export interface RenderedWidget {
  /** Globally unique slug, conventionally `<plugin>.<name>`. */
  slug: string;
  /** Title shown in the widget chrome. */
  title: string;
  /** Pre-fetched data plus the rendered React node. Server fetches and renders before this client component mounts. */
  body: React.ReactNode;
  /** Right-aligned actions in the title row (refresh, open settings, etc.). Excluded from drag handle. */
  headerActions?: React.ReactNode;
  /** Geometry on the 12-col grid. */
  layout: { x: number; y: number; w: number; h: number };
  /** Resize bounds (defaults to {1,1}..{12,50} if not specified). */
  minSize?: { w?: number; h?: number };
  maxSize?: { w?: number; h?: number };
}

interface Props {
  /** Widgets to display, in registry order. Server has already chosen each widget's geometry. */
  widgets: RenderedWidget[];
}

const ROW_HEIGHT = 60;
const COLS = 12;

export function DashboardGrid({ widgets }: Props) {
  // Track layout in local state so RGL drag/resize updates feel instant.
  // Persistence is fire-and-forget on every drag/resize stop.
  const [layout, setLayout] = useState<Layout[]>(() =>
    widgets.map((w) => ({
      i: w.slug,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: w.minSize?.w ?? 1,
      minH: w.minSize?.h ?? 1,
      maxW: w.maxSize?.w ?? 12,
      maxH: w.maxSize?.h ?? 50
    }))
  );

  const persist = useCallback((next: Layout[]) => {
    const payload = next.map((item) => ({
      slug: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h
    }));
    void saveDashboardLayoutAction(payload);
  }, []);

  const onLayoutChange = useCallback((next: Layout[]) => {
    setLayout(next);
  }, []);

  const onDragStop = useCallback(
    (next: Layout[]) => {
      persist(next);
    },
    [persist]
  );
  const onResizeStop = useCallback(
    (next: Layout[]) => {
      persist(next);
    },
    [persist]
  );

  const bySlug = useMemo(() => new Map(widgets.map((w) => [w.slug, w])), [widgets]);

  // First paint: WidthProvider's initial fallback width (1280) doesn't
  // match the actual container, so RGL recomputes positions on mount and
  // CSS-animates items from their first-paint coords into the right slots.
  // We suppress that initial transition by holding a `mounted` flag for one
  // tick — by the time it flips to true, RGL has measured + repositioned,
  // and any subsequent transitions (drag, resize, window-resize) animate
  // normally.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <ResponsiveGrid
      className={`layout ${mounted ? "" : "[&_.react-grid-item]:!transition-none"}`}
      layout={layout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      compactType="vertical"
      draggableHandle=".widget-drag-handle"
      onLayoutChange={onLayoutChange}
      onDragStop={onDragStop}
      onResizeStop={onResizeStop}
    >
      {layout.map((item) => {
        const w = bySlug.get(item.i);
        if (!w) return null;
        return (
          <div key={item.i} className="rounded-xl bg-white border border-slate-200 p-5 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="widget-drag-handle text-[11px] uppercase tracking-wider text-slate-400 font-bold cursor-move select-none flex-1 min-w-0 truncate">
                {w.title}
              </div>
              {w.headerActions ? (
                <div className="shrink-0 flex items-center">{w.headerActions}</div>
              ) : null}
            </div>
            <div className="flex-1 overflow-x-hidden overflow-y-auto min-h-0">{w.body}</div>
          </div>
        );
      })}
    </ResponsiveGrid>
  );
}
