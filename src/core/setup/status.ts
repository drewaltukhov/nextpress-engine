import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * Check whether the first-run setup wizard has been completed.
 * Uses the autoload cache when available (fast path at boot).
 */
export async function isSetupComplete(db: DbClient): Promise<boolean> {
  const val = await getSetting<boolean>(db, "system.setup_complete");
  return val === true;
}
