"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { getClientIp } from "@core/net/client-ip";

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
  allowAdminAccess: boolean;
  readOnly: boolean;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  const [enabled, message, bypassIps, readOnly] = await Promise.all([
    getSetting<boolean>(db(), "maintenance.enabled"),
    getSetting<string>(db(), "maintenance.message"),
    getSetting<string>(db(), "maintenance.bypass_ips"),
    getSetting<boolean>(db(), "maintenance.read_only"),
  ]);

  // The toggle is "on" if there are any bypass IPs configured
  const hasBypass = (bypassIps ?? "").trim().length > 0;

  return {
    enabled: enabled ?? false,
    message: message ?? "We'll be back shortly.",
    allowAdminAccess: hasBypass,
    readOnly: readOnly ?? false,
  };
}

/**
 * Read the current request's IP address. Routes through `getClientIp` so
 * Vercel's unspoofable `x-vercel-forwarded-for` is preferred. Falls back to
 * `127.0.0.1` rather than `0.0.0.0` because callers seed the bypass list
 * from this value — `127.0.0.1` is at least useful in local dev, while a
 * `0.0.0.0` entry would never match any real request.
 */
async function currentIp(): Promise<string> {
  try {
    const ip = getClientIp(await headers());
    return ip === "0.0.0.0" ? "127.0.0.1" : ip;
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Collect IPs to bypass maintenance: the current request IP (the admin
 * who is toggling the setting) plus distinct IPs from recent admin logins.
 */
async function collectAdminBypassIps(): Promise<string[]> {
  const ips = new Set<string>();

  // Always include the IP of the admin making this request
  const reqIp = await currentIp();
  if (reqIp && reqIp !== "0.0.0.0") ips.add(reqIp);
  // Also add both localhost forms so dev works regardless of IPv4/v6
  if (reqIp === "::1" || reqIp === "127.0.0.1") {
    ips.add("::1");
    ips.add("127.0.0.1");
  }

  // Add IPs from recent admin login events
  try {
    const res = await db().execute({
      sql: `SELECT DISTINCT a.ip_address
            FROM audit_log a
            WHERE a.action = 'auth.login.success'
              AND a.ip_address IS NOT NULL
              AND a.ip_address != '0.0.0.0'
              AND a.created_at > datetime('now', '-90 days')
            ORDER BY a.created_at DESC
            LIMIT 20`,
      args: [],
    });
    for (const r of res.rows) {
      const ip = String(r.ip_address);
      if (ip) ips.add(ip);
    }
  } catch {
    // Query failure shouldn't block the save — we at least have the current IP
  }

  return [...ips];
}

export async function saveMaintenanceSettings(input: MaintenanceSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change maintenance settings" };
  }

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };
  try {
    // If "Allow admin access" is on, auto-populate bypass IPs from recent admin logins
    let bypassIps = "";
    if (input.allowAdminAccess) {
      const ips = await collectAdminBypassIps();
      bypassIps = ips.join("\n");
    }

    await setSetting(db(), "maintenance.enabled", input.enabled, opts);
    await setSetting(db(), "maintenance.message", input.message.trim(), opts);
    await setSetting(db(), "maintenance.bypass_ips", bypassIps, opts);
    await setSetting(db(), "maintenance.read_only", input.readOnly, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.maintenance.update",
      targetType: "settings",
      targetId: "maintenance",
      diff: input,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
