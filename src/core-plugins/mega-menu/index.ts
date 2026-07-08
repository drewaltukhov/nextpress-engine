import type { PluginAPI } from "@core/plugins/api";

/**
 * Mega Menu core-plugin.
 *
 * Each top-level menu item can have a "mega panel" attached: a pre-built
 * React layout (one of `layouts/`) configured with a small form. Authoring
 * lives at `/admin/menus/[menuId]/items/[itemId]/mega`; rendering hooks
 * into `<NavMenu>` via the metadata pipeline in themes/render.tsx.
 */
export default function register(_api: PluginAPI): void {
  // No hooks today. Surface area:
  //   - migrations/    → schema applied by the core migration runner
  //   - service.ts     → consumed by admin editor + NavMenu render path
  //   - layouts/       → registry of pre-built layouts
  //   - components/    → server renderer that dispatches by layout id
  //   - render-helpers → bridges service ↔ themes/render.tsx metadata
}

export {
  getPanel,
  savePanel,
  deletePanel,
  getPanelsByMenu,
  type MegaPanelDetail,
} from "./service";

export {
  REGISTRY as MEGA_LAYOUT_REGISTRY,
  getLayout,
  WIDTH_MODES,
  type LayoutDef,
  type WidthMode,
  type EditorialConfig,
  type MultiSectionConfig,
  type ShowcaseConfig,
} from "./layouts";
