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

/**
 * The anonymous first-run wizard and the reset-to-wizard flow are off in
 * production unless NEXTPRESS_ALLOW_SETUP=1. An open "create the first
 * admin" page on a live site is only an attack surface (security audit 2026-11-12). Set the flag for the one
 * deploy that bootstraps a brand-new site, then remove it.
 */
export function isSetupAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXTPRESS_ALLOW_SETUP === "1";
}
