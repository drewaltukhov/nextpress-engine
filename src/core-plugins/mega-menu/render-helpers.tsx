import type { ReactNode } from "react";
import type { DbClient } from "@core/db/client";
import { getMenuByLocation } from "@core-plugins/menus";
import { getPanelsByMenu } from "./service";
import type { WidthMode } from "./layouts";

export interface PreRenderedPanel {
  /** The pre-rendered panel JSX. */
  node: ReactNode;
  /** Width preference — NavMenu uses this to size the outer wrapper. */
  widthMode: WidthMode;
}

/**
 * Pre-render mega panels for the given menu locations. Used by the theme
 * renderer (`themes/render.tsx`) — produces a
 * `Record<location, Record<itemId, PreRenderedPanel>>` that NavMenu reads
 * via Puck metadata to attach panels to the right items.
 *
 * The MegaPanelRender import is dynamic so the layout-registry chain
 * (which imports next/link, getMediaPublicUrl, etc.) doesn't pull into
 * any node-side script that walks the plugin graph (e.g. migrate:plan).
 */
export async function prefetchPanelsForMenuLocations(
  db: DbClient,
  locations: readonly string[],
): Promise<Record<string, Record<number, PreRenderedPanel>>> {
  if (locations.length === 0) return {};

  const menus = await Promise.all(
    locations.map((loc) => getMenuByLocation(db, loc)),
  );

  const panelsPerMenu = await Promise.all(
    menus.map((m) => (m ? getPanelsByMenu(db, m.id) : Promise.resolve(new Map()))),
  );

  const hasAnyPanel = panelsPerMenu.some((m) => m && m.size > 0);
  if (!hasAnyPanel) return {};

  // Lazy-import the renderer so its layout-registry chain (next/link,
  // media url helper, etc.) only loads on the request path that needs it.
  // Deferring keeps node-side scripts (e.g. `npm run migrate:plan`) from
  // crashing on the chain — same trap themes/render.tsx documents for
  // pages/blocks.
  const { MegaPanelRender } = await import("./components/MegaPanelRender");

  const out: Record<string, Record<number, PreRenderedPanel>> = {};
  locations.forEach((loc, i) => {
    const panelMap = panelsPerMenu[i];
    if (!panelMap || panelMap.size === 0) return;
    const rendered: Record<number, PreRenderedPanel> = {};
    for (const [itemId, panel] of panelMap) {
      rendered[itemId] = {
        node: (
          <MegaPanelRender
            db={db}
            layoutId={panel.layoutId}
            config={panel.config}
            widthMode={panel.widthMode}
          />
        ),
        widthMode: panel.widthMode,
      };
    }
    out[loc] = rendered;
  });
  return out;
}
