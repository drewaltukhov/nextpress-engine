/**
 * IP allow/block list enforcement + auto-blocking.
 *
 * Allowed-IP CIDR matching takes priority over blocked-IP checks — an IP
 * that falls within any allowed_ips row is never blocked. The auto-blocker
 * counts distinct failed-login attempts per IP across all emails in a
 * sliding window and blocks the IP when the threshold is breached.
 *
 * Thresholds are hardcoded constants until site_settings ships (Phase 6).
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { systemLog } from "@core-plugins/logging";

const IP_ACCESS_CACHE_TAG = "nextpress:ip-access";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

// ---------------------------------------------------------------------------
// Constants (future: read from site_settings.security.*)
// ---------------------------------------------------------------------------

export const IP_FAILURE_THRESHOLD = 20;
export const IP_FAILURE_WINDOW_MINUTES = 30;
export const IP_LOCKOUT_MINUTES = 60;

// ---------------------------------------------------------------------------
// CIDR helpers — pure functions, no DB
// ---------------------------------------------------------------------------

/**
 * Parse an IPv4 address to a 32-bit number. Returns null for non-IPv4.
 */
function ipv4ToNum(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  // Convert to unsigned 32-bit
  return num >>> 0;
}

/**
 * Check whether `ip` falls within `cidr`. Supports IPv4 only (IPv6 CIDR
 * matching is deferred to v1.x — the table can hold the notation but the
 * runtime check is skipped).
 *
 * CIDR examples: "10.0.0.0/8", "192.168.1.42/32"
 */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split("/");
  if (!network || prefixStr == null) return false;

  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const ipNum = ipv4ToNum(ip);
  const netNum = ipv4ToNum(network);
  if (ipNum === null || netNum === null) return false;

  if (prefix === 0) return true;

  const mask = (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

// ---------------------------------------------------------------------------
// Access-check result
// ---------------------------------------------------------------------------

export interface IpAccessResult {
  allowed: boolean;
  reason: "allowed_ip" | "blocked" | "country_blocked" | "ok";
  blockedUntil?: string | null;
  blockReason?: string;
  /** ISO-3166-1 alpha-2 of the offending IP — set when reason='country_blocked'. */
  country?: string;
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

/**
 * Check whether `ip` is allowed, blocked, or neutral.
 *
 * Order:
 *   1. If ip matches any row in allowed_ips → allowed (bypass everything)
 *   2. If ip has an active entry in blocked_ips → blocked
 *   3. If country filter is on AND ip's country fails the rule → country_blocked
 *   4. Otherwise → ok
 *
 * Country lookups: callers running on Vercel (or behind any proxy that sets
 * `x-vercel-ip-country`) should pass `countryHint` — Vercel's edge already
 * classified the IP and the header is unspoofable. When `countryHint` is
 * unset, `countryFor` returns null (geo lookup removed); country filtering
 * fails-open for self-hosted deploys without the header.
 */
// ─── Process-scoped allowed_ips cache ──────────────────────────────────────
// Read on every public-path request (and on every login-failure auto-block
// check). Allow list changes only via admin write.
const ALLOWED_CACHE_KEY = "__nextpress_allowed_ips_cache__" as const;
const ALLOWED_CACHE_AT_KEY = "__nextpress_allowed_ips_cache_at__" as const;
const ALLOWED_CACHE_TTL_MS = 5 * 60_000;

function allowedCidrs(): string[] | null {
  return (globalThis as unknown as Record<string, string[] | null | undefined>)[ALLOWED_CACHE_KEY] ?? null;
}
function setAllowedCidrs(list: string[] | null): void {
  (globalThis as unknown as Record<string, string[] | null>)[ALLOWED_CACHE_KEY] = list;
  (globalThis as unknown as Record<string, number>)[ALLOWED_CACHE_AT_KEY] = list ? Date.now() : 0;
}
function allowedCidrsAge(): number {
  return Date.now() - ((globalThis as unknown as Record<string, number | undefined>)[ALLOWED_CACHE_AT_KEY] ?? 0);
}

function invalidateAllowedCidrsCache(): void {
  setAllowedCidrs(null);
  try {
    updateTag(IP_ACCESS_CACHE_TAG);
  } catch {
    // non-Server-Action context — in-process clear is enough
  }
}

async function loadAllowedCidrsRaw(db: DbClient): Promise<string[]> {
  const rows = await db.execute({
    sql: "SELECT ip_cidr FROM allowed_ips WHERE tenant_id = 1",
    args: [],
  });
  return rows.rows.map((r) => String(r.ip_cidr));
}

const loadAllowedCidrsCached = unstable_cache(
  (): Promise<string[]> => loadAllowedCidrsRaw(getRuntimeDb()),
  ["nextpress", "allowed-ips", "v1"],
  { tags: [IP_ACCESS_CACHE_TAG], revalidate: 300 },
);

async function getAllowedCidrs(db: DbClient): Promise<string[]> {
  const existing = allowedCidrs();
  if (existing && allowedCidrsAge() < ALLOWED_CACHE_TTL_MS) return existing;
  const list = await cacheOrFallback(
    () => loadAllowedCidrsCached(),
    () => loadAllowedCidrsRaw(db),
  );
  setAllowedCidrs(list);
  return list;
}

export async function checkIpAccess(
  db: DbClient,
  ip: string,
  now: Date = new Date(),
  options: { countryHint?: string | null } = {}
): Promise<IpAccessResult> {
  // 1. Check allowed list (CIDR match)
  for (const cidr of await getAllowedCidrs(db)) {
    if (ipMatchesCidr(ip, cidr)) {
      return { allowed: true, reason: "allowed_ip" };
    }
  }

  // 2. Check blocked list (exact IP match)
  const blockRow = await db.execute({
    sql: `SELECT reason, blocked_until
          FROM blocked_ips
          WHERE tenant_id = 1 AND ip_address = ?
            AND (blocked_until IS NULL OR blocked_until > ?)
          LIMIT 1`,
    args: [ip, now.toISOString()]
  });
  if (blockRow.rows.length > 0) {
    const r = blockRow.rows[0];
    return {
      allowed: false,
      reason: "blocked",
      blockedUntil: r.blocked_until ? String(r.blocked_until) : null,
      blockReason: String(r.reason)
    };
  }

  // 3. Country filter (skipped entirely when mode='off')
  const countryResult = await checkCountryFilter(db, ip, options.countryHint ?? null);
  if (countryResult) return countryResult;

  return { allowed: true, reason: "ok" };
}

async function checkCountryFilter(
  db: DbClient,
  ip: string,
  countryHint: string | null
): Promise<IpAccessResult | null> {
  let mode: string | undefined;
  let codesRaw: string | undefined;
  try {
    const { getSetting } = await import("@core-plugins/settings/registry");
    [mode, codesRaw] = await Promise.all([
      getSetting<string>(db, "security.country_mode"),
      getSetting<string>(db, "security.country_codes")
    ]);
  } catch {
    return null;
  }

  if (!mode || mode === "off") return null;

  const { countryFor, parseCountryCodes } = await import("./geo");
  const codes = parseCountryCodes(codesRaw ?? "");
  if (codes.size === 0) return null;

  // Prefer the caller's hint (Vercel sets x-vercel-ip-country at the edge,
  // unspoofable). Without a hint, countryFor returns null and the filter
  // fails-open.
  const hinted = countryHint?.trim().toUpperCase();
  const country = hinted && /^[A-Z]{2}$/.test(hinted) ? hinted : await countryFor(ip);
  if (!country) return null;

  if (mode === "allowlist" && !codes.has(country)) {
    return {
      allowed: false,
      reason: "country_blocked",
      blockedUntil: null,
      blockReason: "country_not_in_allowlist",
      country
    };
  }
  if (mode === "denylist" && codes.has(country)) {
    return {
      allowed: false,
      reason: "country_blocked",
      blockedUntil: null,
      blockReason: "country_in_denylist",
      country
    };
  }

  return null;
}

/**
 * Manually block an IP address.
 */
export async function blockIp(
  db: DbClient,
  opts: {
    ipAddress: string;
    reason: "manual" | "admin_blocked";
    blockedUntil?: string | null;
    blockedBy?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO blocked_ips (ip_address, tenant_id, reason, blocked_until, blocked_by, notes)
          VALUES (?, 1, ?, ?, ?, ?)
          ON CONFLICT (ip_address, tenant_id) DO UPDATE SET
            reason = excluded.reason,
            blocked_until = excluded.blocked_until,
            blocked_by = excluded.blocked_by,
            notes = excluded.notes,
            created_at = CURRENT_TIMESTAMP`,
    args: [
      opts.ipAddress,
      opts.reason,
      opts.blockedUntil ?? null,
      opts.blockedBy ?? null,
      opts.notes ?? null
    ]
  });
}

/**
 * Remove an IP from the block list.
 */
export async function unblockIp(db: DbClient, ipAddress: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM blocked_ips WHERE ip_address = ? AND tenant_id = 1",
    args: [ipAddress]
  });
}

/**
 * Add a CIDR range to the allow list.
 */
export async function addAllowedIp(
  db: DbClient,
  opts: {
    ipCidr: string;
    label: string;
    notes?: string | null;
    createdBy?: string | null;
  }
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO allowed_ips (ip_cidr, tenant_id, label, notes, created_by)
          VALUES (?, 1, ?, ?, ?)
          ON CONFLICT (ip_cidr, tenant_id) DO UPDATE SET
            label = excluded.label,
            notes = excluded.notes`,
    args: [opts.ipCidr, opts.label, opts.notes ?? null, opts.createdBy ?? null]
  });
  invalidateAllowedCidrsCache();
}

/**
 * Remove a CIDR range from the allow list.
 */
export async function removeAllowedIp(db: DbClient, ipCidr: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM allowed_ips WHERE ip_cidr = ? AND tenant_id = 1",
    args: [ipCidr]
  });
  invalidateAllowedCidrsCache();
}

/**
 * Count distinct failed-login attempts from `ip` in the sliding window and
 * auto-block if the threshold is reached. Called after `recordFailedLogin()`
 * from the auth path.
 *
 * Skips the check if the IP already has an active block.
 */
export async function autoBlockIfThresholdBreached(
  db: DbClient,
  ip: string,
  now: Date = new Date()
): Promise<{ blocked: boolean }> {
  // Skip if already blocked
  const existing = await db.execute({
    sql: `SELECT 1 FROM blocked_ips
          WHERE tenant_id = 1 AND ip_address = ?
            AND (blocked_until IS NULL OR blocked_until > ?)
          LIMIT 1`,
    args: [ip, now.toISOString()]
  });
  if (existing.rows.length > 0) return { blocked: true };

  // Check if IP is on the allow list — never auto-block allowed IPs
  for (const cidr of await getAllowedCidrs(db)) {
    if (ipMatchesCidr(ip, cidr)) {
      return { blocked: false };
    }
  }

  // Count recent failures from this IP
  const windowStart = new Date(now.getTime() - IP_FAILURE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const countRow = await db.execute({
    sql: `SELECT COUNT(*) AS n
          FROM failed_logins
          WHERE tenant_id = 1
            AND ip_address = ?
            AND created_at >= ?`,
    args: [ip, windowStart]
  });
  const failCount = Number(countRow.rows[0]?.n ?? 0);

  if (failCount < IP_FAILURE_THRESHOLD) return { blocked: false };

  // Threshold breached — auto-block
  const blockedUntil = new Date(now.getTime() + IP_LOCKOUT_MINUTES * 60 * 1000).toISOString();
  await db.execute({
    sql: `INSERT INTO blocked_ips (ip_address, tenant_id, reason, blocked_until, attempt_count)
          VALUES (?, 1, 'auto:brute_force', ?, ?)
          ON CONFLICT (ip_address, tenant_id) DO UPDATE SET
            reason = 'auto:brute_force',
            blocked_until = excluded.blocked_until,
            attempt_count = excluded.attempt_count,
            created_at = CURRENT_TIMESTAMP`,
    args: [ip, blockedUntil, failCount]
  });

  // Log but don't audit (auto-blocks don't go to audit_log per spec)
  try {
    await systemLog(db, {
      level: "warn",
      source: "security",
      event: "security.ip_blocked",
      message: `Auto-blocked IP ${ip} after ${failCount} failed attempts`,
      context: { ip, failCount, blockedUntil }
    });
  } catch {
    // Logging failures must not break the auth path
  }

  return { blocked: true };
}
