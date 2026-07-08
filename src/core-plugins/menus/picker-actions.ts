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
  const all = await listMenus(db());
  return all
    .filter((m) => typeof m.location === "string" && m.location.length > 0)
    .map((m) => ({ location: m.location as string, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
