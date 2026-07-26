/**
 * Admin editor Puck config. Starts from the Pages plugin's render-only config
 * (shared with the public `/[slug]` renderer) and re-attaches the admin-only
 * editor fields — Tiptap, the Puck-editor mobile-column-order field — that the
 * block modules deliberately omit so they never ship to public pages.
 * Importing the fields barrel here (and nowhere in the public render path)
 * keeps that editor JS in the admin client bundle. See `withAdminFields` /
 * `registerBlockFields` in the registry.
 */
import { puckConfig as renderConfig } from "@core-plugins/pages/blocks";
import { withAdminFields } from "@core/blocks/registry";
// Side-effect: register admin-only editor fields (core blocks + site widgets).
// These barrels import the heavy editor UI (Tiptap, media/link/hex pickers,
// the Puck-editor mobile-column-order field) and are loaded ONLY here in the
// admin bundle — never in the public render path.
import "@core-plugins/pages/blocks/fields";
import "@core-plugins/site-widgets/fields";

export const puckConfig = withAdminFields(renderConfig);
