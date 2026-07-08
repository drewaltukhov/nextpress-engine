/**
 * Resolve the active admin entry path.
 *
 *   env (NEXTPRESS_ADMIN_PATH) > db (hide-admin.path) > "/admin"
 *
 * `resolveAdminPath` is the pure decision function — easy to test.
 * `getAdminPath(db)` is the runtime convenience that reads from the
 * settings registry. The env var is the documented recovery escape hatch:
 * set NEXTPRESS_ADMIN_PATH=/admin in Vercel env (or any host) to disable
 * the hide without DB access.
 *
 * Invalid values are *silently ignored* with a fall-through, not thrown —
 * the proxy must never crash because of a misconfigured slug.
 */

import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { validateAdminPath } from "./admin-path-validator";

const DEFAULT_PATH = "/admin";

interface ResolveInput {
  envValue: string | undefined;
  dbValue: string | null | undefined;
}

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function resolveAdminPath({ envValue, dbValue }: ResolveInput): string {
  const env = normalize(envValue);
  if (env !== null) {
    // Allow the explicit-disable case: env="/admin" forces default,
    // which is a valid slug by validator standards only because we
    // short-circuit here.
    if (env === DEFAULT_PATH) return DEFAULT_PATH;
    if (validateAdminPath(env).ok) return env;
  }

  const dbv = normalize(dbValue);
  if (dbv !== null && validateAdminPath(dbv).ok) return dbv;

  return DEFAULT_PATH;
}

export async function getAdminPath(db: DbClient): Promise<string> {
  const envValue = process.env.NEXTPRESS_ADMIN_PATH;
  const dbValue = await getSetting<string>(db, "hide-admin.path").catch(() => null);
  return resolveAdminPath({ envValue, dbValue });
}
