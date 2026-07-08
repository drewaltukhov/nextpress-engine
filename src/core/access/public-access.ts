import { forbidden } from "next/navigation";
import { db } from "@core/db/instance";
import { getClientIp } from "@core/net/client-ip";
import { checkIpAccess, type IpAccessResult } from "@core-plugins/security/ip-access";

/**
 * Headers-based access check usable from proxy (`src/proxy.ts`) where
 * `next/headers` isn't available. Returns the underlying check result;
 * callers decide how to respond (forbidden() in server components,
 * `NextResponse` in proxy).
 *
 * Failure mode: if the access check itself throws, returns `allowed: true`
 * so transient infrastructure errors don't lock everyone out.
 */
export async function checkPublicAccessForRequest(h: Headers): Promise<IpAccessResult> {
  try {
    const ip = getClientIp(h);
    // Vercel sets `x-vercel-ip-country` at the edge; pass it as a hint so
    // checkIpAccess skips the (now-null) geo lookup. Self-hosted deploys
    // without this header get null country, which fails-open by design.
    const countryHint = h.get("x-vercel-ip-country");
    return await checkIpAccess(db(), ip, new Date(), { countryHint });
  } catch {
    return { allowed: true, reason: "allowed_ip" };
  }
}

/**
 * Server-component shim that still uses `next/headers` for callers that
 * haven't migrated. Public-route pages no longer call this — the proxy
 * runs the same check before the page handler — but server actions and
 * any non-proxied entry point can still use it.
 *
 * Kept so existing callers compile; new code should let proxy handle it.
 */
export async function assertPublicAccess(): Promise<void> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const result = await checkPublicAccessForRequest(h);
  if (!result.allowed) {
    forbidden();
  }
}
