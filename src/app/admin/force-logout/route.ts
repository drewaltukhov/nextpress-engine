import { NextResponse, type NextRequest } from "next/server";
import { db } from "@core/db/instance";
import { getAdminPath } from "@core/auth/admin-path";

/**
 * Force-logout target for sessions the database has ended.
 *
 * The main sender is the proxy's stale-session gate (`staleSessionRedirect`,
 * src/core/auth/stale-session-gate.ts — see its docblock for the redirect
 * loop this prevents); the admin shell layout's freshness check is a
 * backstop. `reason` is one of checkSessionFreshness's: `expired`
 * (security.session_max_age_days), `revoked` (session_revocations row),
 * `disabled`, `user_missing` (e.g. a backup restore re-created users under
 * different ids) or `missing_iat` (a token from before the authTime claim).
 *
 * Neither the proxy nor a layout can reliably delete the cookie, so this
 * route handler clears it before redirecting. Cookies are set on the
 * NextResponse directly — using `cookies()` from next/headers before
 * returning a NextResponse.redirect() does not reliably attach the
 * Set-Cookie header to the redirect response, which would leave the
 * stale session in place and send the user straight back here.
 */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason") ?? "expired";

  // Relative Location on purpose: behind the Dokploy/Traefik proxy,
  // `req.url` carries the container's internal origin (localhost:3000), so
  // an absolute URL built from it sends live users to https://localhost:3000.
  // Middleware redirects get relativized by Next.js; route handlers don't.
  // With hide-admin on, /admin/login 404s for signed-out visitors: send them
  // to the active admin slug instead (the proxy's self-heal block does the same).
  let adminSlug = "/admin";
  try {
    adminSlug = await getAdminPath(db());
  } catch {
    // Settings unreachable — fall back to the canonical login page.
  }
  const params = new URLSearchParams({ reason });
  const location = adminSlug === "/admin" ? `/admin/login?${params}` : adminSlug;
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: location },
  });

  // Clear every Auth.js cookie under both dev (http) and prod (https) names
  // so this works regardless of deployment scheme. The session token, CSRF
  // token, callback-url, and OAuth-flow cookies all get wiped together — a
  // rotated AUTH_SECRET or backup restore invalidates each of them, and a
  // half-cleared state can wedge the login form even after the JWT is gone.
  // The CSRF cookie uses a __Host- prefix under HTTPS, the others __Secure-.
  res.cookies.delete("authjs.session-token");
  res.cookies.delete("__Secure-authjs.session-token");
  for (let i = 0; i < 10; i += 1) {
    res.cookies.delete(`authjs.session-token.${i}`);
    res.cookies.delete(`__Secure-authjs.session-token.${i}`);
  }
  res.cookies.delete("authjs.callback-url");
  res.cookies.delete("__Secure-authjs.callback-url");
  res.cookies.delete("authjs.csrf-token");
  res.cookies.delete("__Host-authjs.csrf-token");
  res.cookies.delete("authjs.pkce.code_verifier");
  res.cookies.delete("__Secure-authjs.pkce.code_verifier");
  res.cookies.delete("authjs.state");
  res.cookies.delete("__Secure-authjs.state");
  res.cookies.delete("authjs.nonce");
  res.cookies.delete("__Secure-authjs.nonce");
  res.cookies.delete("authjs.challenge");
  res.cookies.delete("__Secure-authjs.challenge");

  return res;
}
