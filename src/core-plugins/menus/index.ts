import type { PluginAPI } from "@core/plugins/api";
// Side-effect import: registers NavMenu with the cross-surface
// registry at module load. Splitting it into a dedicated file lets the
// client builder bundle import the same registration path the server's
// plugin loader hits — keeps the registry contents identical between
// SSR and CSR, which the widget-rail rendering depends on.
import "./blocks";

/**
 * Menus core-plugin — navigation menus + the `<NavMenu>` Puck block.
 *
 * Block registration runs at module load via `./blocks`. The plugin
 * loader still calls this `register()` for hook/widget wiring (none
 * today, but reserved); leaving the export keeps the manifest contract.
 *
 * Menus admin pages live under `src/app/admin/(shell)/menus/`.
 */
export default function register(_api: PluginAPI): void {
  // No-op — the block registration happens via the `./blocks` import above.
}

export {
  listMenus,
  getMenu,
  getMenuBySlug,
  getMenuByLocation,
  createMenu,
  updateMenu,
  deleteMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  moveMenuItem,
  MenuSlugConflictError,
  MenuNotFoundError,
  MenuItemNotFoundError,
  type MenuListItem,
  type MenuDetail,
  type MenuItemDetail,
  type CreateMenuInput,
  type UpdateMenuInput,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
} from "./service";

export {
  MENU_ITEM_TYPES,
  MENU_ITEM_TARGETS,
  MENU_STYLES,
  type MenuItemType,
  type MenuItemTarget,
  type MenuStyle,
} from "./schema/menus";

export {
  loadAvailableMenuLocations,
  type AvailableMenuLocation,
} from "./picker-actions";

export { MenuLocationPickerInput } from "./components/MenuLocationPickerInput";

/**
 * Walk a Puck data tree and collect every block's menu location string(s).
 * Public renderers call this, then batch-fetch each menu via
 * `getMenuByLocation`, and inject the result into Puck metadata so
 * blocks can find their menu without round-tripping per block.
 *
 * Handles:
 *   - `NavMenu` → props.location (string)
 *
 * Mirrors `collectGalleryIds` / `collectShortcodeMediaIds` in the Pages
 * blocks library.
 */
export function collectMenuLocations(
  content: {
    type?: string;
    props?: {
      location?: string;
      menuLocation?: string;
      menu?: { location?: string };
    };
  }[],
): string[] {
  const locations = new Set<string>();
  for (const block of content) {
    // NavMenu: flat location prop
    if (block.type === "NavMenu") {
      const loc = block.props?.location;
      if (typeof loc === "string" && loc.trim().length > 0) locations.add(loc.trim());
    }
  }
  return Array.from(locations);
}
