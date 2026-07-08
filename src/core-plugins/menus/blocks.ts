/**
 * Menus block registration — module-level side effect.
 *
 * Mirrors `src/core-plugins/pages/blocks/index.ts`: registering at
 * module load means the cross-surface registry has the same entries
 * regardless of who imports the module — the server plugin loader
 * (via `register()` in `index.ts`) and the client builder bundle (via
 * a side-effect import in ThemeBuilderClient) both end up with NavMenu
 * present in the same registration position.
 *
 * Without this, NavMenu landed in the server registry only, the widget
 * rail's contents differed between SSR and CSR, and Puck's drawer
 * threw a hydration mismatch.
 */
import { registerBlock } from "@core/blocks/registry";
import { NavMenuBlock } from "./components/NavMenu";

registerBlock({ ...NavMenuBlock, source: "core" });
