/**
 * Maintenance + read-only enforcement helpers, driven by the
 * `maintenance.*` settings.
 *
 * Two related but distinct policies:
 *   - read_only: blocks every mutating server action (writes, deletes,
 *     transport sends). Admins are NOT exempt — only IPs that match the
 *     bypass list bypass the gate. The `saveMaintenanceSettings` action
 *     deliberately skips the gate so a stuck admin can still turn it off.
 *   - enabled (maintenance mode): blocks the storefront with a 503 page.
 *     `/admin/*` paths stay reachable so an admin can keep working;
 *     non-admin paths get the message. Bypass IPs always pass.
 */
import { headers } from "next/headers";
import type { DbClient } from "@core/db/client";
import { ipMatchesCidr } from "@core-plugins/security";
import { getSetting } from "@core-plugins/settings/registry";
import { getClientIp } from "@core/net/client-ip";

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  readOnly: boolean;
  /** Parsed bypass list — one CIDR per element. */
  bypassCidrs: readonly string[];
}

export async function getMaintenanceState(db: DbClient): Promise<MaintenanceState> {
  const [enabled, message, bypassRaw, readOnly] = await Promise.all([
    getSetting<boolean>(db, "maintenance.enabled"),
    getSetting<string>(db, "maintenance.message"),
    getSetting<string>(db, "maintenance.bypass_ips"),
    getSetting<boolean>(db, "maintenance.read_only"),
  ]);
  return {
    enabled: enabled ?? false,
    message: message ?? "We'll be back shortly.",
    readOnly: readOnly ?? false,
    bypassCidrs: (bypassRaw ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

async function readRequestIp(): Promise<string> {
  try {
    return getClientIp(await headers());
  } catch {
    // headers() throws outside a request scope (e.g. cron). Treat as a
    // non-bypass IP so the guard fails closed.
    return "0.0.0.0";
  }
}

export function ipBypasses(ip: string, cidrs: readonly string[]): boolean {
  for (const entry of cidrs) {
    // Exact match (bare IP or IPv6) — handles "::1", "127.0.0.1", etc.
    if (entry === ip) return true;
    // CIDR match (IPv4 only)
    if (entry.includes("/") && ipMatchesCidr(ip, entry)) return true;
  }
  return false;
}

export interface WriteGuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Call at the top of every mutating server action. Returns `{ ok: true }`
 * unless `maintenance.read_only` is on AND the request IP isn't in the
 * bypass list. The `saveMaintenanceSettings` action is the one
 * intentional exception — a stuck admin must always be able to flip the
 * toggle back off.
 */
export async function assertWriteable(db: DbClient): Promise<WriteGuardResult> {
  const state = await getMaintenanceState(db);
  if (!state.readOnly) return { ok: true };
  const ip = await readRequestIp();
  if (ipBypasses(ip, state.bypassCidrs)) return { ok: true };
  return {
    ok: false,
    error: "Site is in read-only mode — only bypass IPs can write right now.",
  };
}
