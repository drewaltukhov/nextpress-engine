/**
 * Re-export the Pages plugin's Puck config so the admin editor and the
 * public `/[slug]` renderer share a single source of truth. The blocks
 * themselves live under `core-plugins/pages/blocks/` (one file per block).
 */
export { puckConfig } from "@core-plugins/pages/blocks";
