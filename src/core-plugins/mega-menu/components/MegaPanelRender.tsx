import type { DbClient } from "@core/db/client";
import { getLayout, type WidthMode } from "../layouts";

interface Props {
  db: DbClient;
  layoutId: string;
  config: unknown;
  widthMode: WidthMode;
}

/**
 * Server-component dispatcher: looks up the layout by id, hardens its
 * config via parseConfig, and renders the layout's component with the
 * live db client. Returns null when the saved layout_id no longer maps
 * to a registered layout (gracefully skip rendering — caller falls back
 * to no-panel).
 *
 * The `widthMode` is honored by NavMenu's outer wrapper, not here. This
 * component renders the inner panel content only.
 */
export async function MegaPanelRender({ db, layoutId, config, widthMode: _widthMode }: Props) {
  const layout = getLayout(layoutId);
  if (!layout) return null;
  const parsed = layout.parseConfig(config);
  return await layout.Render({ db, config: parsed });
}
