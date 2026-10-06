import { NextResponse, type NextRequest } from "next/server";

/**
 * Force-logout target used by the admin shell's session-freshness gate.
 *
 * The shell layout detects `security.session_max_age_days` overflow, a
 * matching `session_revocations` row, or a `user_missing` (e.g. backup
 * restore that re-created the users table under different ids) and
 * bounces the user here instead of straight to /admin/login — without
 * this stop, the still-valid JWT cookie would just send them right back
 * into the shell.
 *
 * Server-component layouts can't mutate cookies, so this route handler
 * clears the JWT cookie before redirecting. Cookies are set on the
 * NextResponse directly — using `cookies()` from next/headers before
 * returning a NextResponse.redirect() does not reliably attach the
 * Set-Cookie header to the redirect response, which would leave the
 * stale session in place and bounce middleware -> /admin -> shell ->
 * /admin/force-logout forever.
 */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason") ?? "expired";

  // Relative Location on purpose: behind the Dokploy/Traefik proxy,
  // `req.url` carries the container's internal origin (localhost:3000), so
  // an absolute URL built from it sends live users to https://localhost:3000.
  // Middleware redirects get relativized by Next.js; route handlers don't.
  const params = new URLSearchParams({ reason });
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: `/admin/login?${params}` },
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
