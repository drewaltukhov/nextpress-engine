"use server";

import { db } from "@core/db/instance";
import { listMenus } from "./service";

export interface AvailableMenuLocation {
  location: string;
  name: string;
}

/**
 * Return menus that have a location string set, suitable for picking
 * in a Puck block field. Used by the `NavMenu` block that renders a
 * menu by `location`.
 */
export async function loadAvailableMenuLocations(): Promise<AvailableMenuLocation[]> {
  // Editor pickers ship in public page bundles (block configs are shared with
  // the public renderer), so the action must refuse anonymous callers itself
  // (security audit 2026-11-12). Imported lazily: plugin entry modules import
  // this file, and a top-level @core/auth import would pull next-auth into
  // every non-request context that loads the plugin.
  const { auth } = await import("@core/auth");
  if (!(await auth())?.user?.id) return [];
  const all = await listMenus(db());
  return all
    .filter((m) => typeof m.location === "string" && m.location.length > 0)
    .map((m) => ({ location: m.location as string, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
