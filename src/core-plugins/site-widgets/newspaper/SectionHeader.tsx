import type { NewspaperTab } from "./types";

interface Props {
  label: string;
  tabs?: NewspaperTab[];
  activeTabKey?: string;
  widgetId: string;
  bgColor?: string;
  tight?: boolean;
}

/**
 * Branded label on the left + optional tab strip on the right.
 *
 * The label background uses `bg-brand-green` so it picks up the
 * Primary Accent Color setting via the existing --color-brand-green
 * token override.
 *
 * Tab buttons emit `data-np-newspaper-tab` + `data-np-newspaper-tab-key`
 * so `NewspaperWidgetsMounter` can wire click + keyboard interactions
 * without React on the client.
 */
export function SectionHeader({ label, tabs, activeTabKey, widgetId, bgColor, tight }: Props) {
  const hasTabs = Array.isArray(tabs) && tabs.length > 1;
  const marginClass = tight ? "mb-3" : "mb-6";
  // `bgColor` paints ONLY the label pill — the rest of the header bar
  // keeps its white background + bottom border (original look). The
  // setting maps cleanly to "the label chip's background color." If
  // the user hasn't picked one, the pill falls back to bg-brand-green.
  return (
    <div className={`np-newspaper-section-header ${marginClass} flex flex-col items-stretch border-b border-slate-200 md:flex-row md:items-center`}>
      <div
        className={`np-newspaper-section-label p-2 text-sm font-semibold uppercase tracking-wide text-white ${bgColor ? "" : "bg-brand-green"}`}
        style={bgColor ? { backgroundColor: bgColor } : undefined}
        data-np-newspaper-label={widgetId}
      >
        {label}
      </div>
      {hasTabs ? (
        <div
          role="tablist"
          aria-label="Section tabs"
          className="np-newspaper-section-tabs md:ml-2 flex items-center gap-1 overflow-x-auto px-2 md:px-0"
          data-np-newspaper-tablist={widgetId}
        >
          {tabs!.map((tab) => {
            const active = tab.key === activeTabKey;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                data-np-newspaper-tab={widgetId}
                data-np-newspaper-tab-key={tab.key}
                className={
                  "np-newspaper-section-tab shrink-0 whitespace-nowrap px-3 py-2 text-sm transition " +
                  (active
                    ? "np-newspaper-section-tab--active font-semibold text-slate-900"
                    : "text-slate-500 hover:text-slate-900")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
