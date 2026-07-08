import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfigEdge } from "@core/auth/config-edge";
import { isAdminOnlyRoute } from "@core/auth/admin-routes";
import { matchRedirect, bumpHitCount } from "@core-plugins/redirects";
import { db } from "@core/db/instance";
import { isSetupComplete } from "@core/setup/status";
import { checkPublicAccessForRequest } from "@core/access/public-access";
import { getMaintenanceState, ipBypasses } from "@core/maintenance";
import { getClientIp } from "@core/net/client-ip";
import { getAdminPath } from "@core/auth/admin-path";
import { decideHideAdminAction } from "@core/auth/admin-path-decision";

/**
 * Middleware — runs on Node runtime so it can hit the libSQL client for
 * redirect lookups. Two responsibilities:
 *
 *   1. Public-URL redirect matching — when an active row in `redirects`
 *      matches the request path, respond with the configured status
 *      (301/302/307/308/410) before the page handler runs. Powers
 *      slug-rename SEO continuity.
 *   2. Admin gating — session + setup-wizard + role gate for /admin/*.
 *
 * Setup state is read from the DB via `isSetupComplete()`, which is backed
 * by the settings bulk cache (process-local, 5-minute TTL). No client-side
 * marker — the cookie-based fast path was removed because it required a
 * self-redirect to set, which looped for cookie-less clients (bots, curl
 * without a jar) and could desync from the DB.
 */
const { auth } = NextAuth(authConfigEdge);

// File-extension test — Next's icon convention emits /admin/icon.svg etc.
// as static assets; the auth gate must let them through.
const STATIC_ASSET = /\.(svg|png|ico|webp|jpe?g|gif|webmanifest|json|css|js|map|txt|woff2?|ttf)$/i;

// Auth.js session-token cookie names — both the dev (http) and prod (https)
// variants, plus the chunked variants used when a JWT exceeds ~4 KB.
// Used to *detect* a "user thinks they're logged in" state. Kept narrow so
// a leftover CSRF/callback cookie alone doesn't trip the self-heal.
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  ...Array.from({ length: 10 }, (_, i) => `authjs.session-token.${i}`),
  ...Array.from({ length: 10 }, (_, i) => `__Secure-authjs.session-token.${i}`),
];

// Full Auth.js cookie set — wiped together when the self-heal fires, since a
// rotated AUTH_SECRET / dev-prod crossover / backup restore invalidates every
// JWT-signed value, not just the session token. Names taken from
// @auth/core/lib/utils/cookie. The CSRF cookie uses a __Host- prefix under
// HTTPS, every other cookie uses __Secure-.
const AUTH_COOKIE_NAMES = [
  ...SESSION_COOKIE_NAMES,
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.pkce.code_verifier",
  "__Secure-authjs.pkce.code_verifier",
  "authjs.state",
  "__Secure-authjs.state",
  "authjs.nonce",
  "__Secure-authjs.nonce",
  "authjs.challenge",
  "__Secure-authjs.challenge",
];

function hasAnyCookie(req: { cookies: { has: (name: string) => boolean } }, names: readonly string[]): boolean {
  for (const name of names) {
    if (req.cookies.has(name)) return true;
  }
  return false;
}

function clearAuthCookies(res: NextResponse): NextResponse {
  for (const name of AUTH_COOKIE_NAMES) {
    res.cookies.delete(name);
  }
  return res;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMaintenanceHtml(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Be right back</title><style>html,body{margin:0;padding:0;height:100%}body{font-family:ui-sans-serif,system-ui,sans-serif;background:#F2F4F8;display:flex;align-items:center;justify-content:center;padding:1rem}.card{max-width:480px;text-align:center;padding:2.5rem;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}h1{font-size:28px;margin:0 0 12px;color:#2A3A5B}p{color:#475569;line-height:1.6;margin:0}</style></head><body><div class="card"><h1>Be right back</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

async function tryRedirect(req: { url: string }, pathname: string): Promise<NextResponse | null> {
  try {
    const hit = await matchRedirect(db(), pathname);
    if (!hit) return null;

    // Fire-and-forget — don't block the response on the analytics write.
    void bumpHitCount(db(), hit.id).catch(() => {});

    if (hit.status === 410) {
      return new NextResponse(null, { status: 410 });
    }

    const dest = /^https?:\/\//i.test(hit.toPath)
      ? hit.toPath
      : new URL(hit.toPath, req.url).toString();
    return NextResponse.redirect(dest, hit.status);
  } catch {
    // DB lookup must never break the public site. Fall through to normal routing.
    return null;
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  if (STATIC_ASSET.test(pathname)) {
    return NextResponse.next();
  }

  // ── Hide-Admin branch ──────────────────────────────────────────────
  // When the active admin slug differs from "/admin", route the request
  // accordingly: rewrite the slug to /admin/login, 404 the canonical
  // path, or pass through. See src/core/auth/admin-path-decision.ts for
  // the truth table.
  const adminSlug = await getAdminPath(db()).catch(() => "/admin");
  if (adminSlug !== "/admin") {
    const action = decideHideAdminAction({
      pathname,
      slug: adminSlug,
      isAuth: Boolean(req.auth),
    });
    if (action.kind === "block") {
      return new NextResponse(null, { status: 404 });
    }
    if (action.kind === "rewrite") {
      return NextResponse.rewrite(new URL(action.target, req.url));
    }
    if (action.kind === "redirect") {
      return NextResponse.redirect(new URL(action.target, req.url));
    }
    // kind === "pass" → fall through to existing pipeline
  }

  // ── Public-path branch ─────────────────────────────────────────────
  // /admin and /api are internal surfaces and have their own setup gate
  // below; the public branch only needs the setup check + access/redirect
  // pipeline.
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api")) {
    // Setup gate. Read straight from the DB (autoload + bulk cache makes
    // this an in-memory Map hit on every request after the first one in
    // the process). No cookie — anonymous, search-engine, and bot traffic
    // all evaluate the same as a logged-in browser.
    const setupDone = await isSetupComplete(db()).catch(() => false);
    if (!setupDone) {
      return NextResponse.redirect(new URL("/admin/setup", req.url));
    }

    // IP/country block. `checkPublicAccessForRequest` is the same gate
    // public pages used to run inline via `assertPublicAccess` — only
    // now it runs in the proxy so the page itself doesn't pull `headers()`.
    const access = await checkPublicAccessForRequest(req.headers);
    if (!access.allowed) {
      return new NextResponse(null, { status: 403 });
    }

    // Maintenance gate. When enabled and the visitor isn't on the bypass
    // list, serve a self-contained 503 with the configured message.
    // Returning the body directly (instead of rewriting to a page) sidesteps
    // Next.js's `_`-prefixed folder exclusion and keeps the response within
    // the proxy — no extra route to maintain.
    try {
      const state = await getMaintenanceState(db());
      if (state.enabled) {
        const ip = getClientIp(req.headers);
        if (!ipBypasses(ip, state.bypassCidrs)) {
          return new NextResponse(buildMaintenanceHtml(state.message), {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Retry-After": "120",
              "Cache-Control": "no-store",
            },
          });
        }
      }
    } catch {
      // DB hiccup — don't 503 the entire site.
    }

    const redirectResponse = await tryRedirect(req, pathname);
    if (redirectResponse) return redirectResponse;
    return NextResponse.next();
  }

  // Self-heal stale session cookies. When a session cookie is present but
  // `req.auth` is null, NextAuth couldn't decode it (AUTH_SECRET rotation,
  // backup restore, dev/prod cookie crossover). Auth.js's own cleanup
  // Set-Cookie header doesn't always survive every redirect path, leaving
  // the browser in a loop where every /admin/* request re-triggers the
  // gate. Forcibly clear every variant on the very first hit so the next
  // request lands in a clean state.
  if (!req.auth && hasAnyCookie(req, SESSION_COOKIE_NAMES)) {
    // When hide-admin is on, redirect to the active slug so the user
    // doesn't bounce into the 404'd /admin/login.
    const target = adminSlug === "/admin" ? "/admin/login" : adminSlug;
    return clearAuthCookies(NextResponse.redirect(new URL(target, req.url)));
  }

  const setupDone = await isSetupComplete(db()).catch(() => false);

  // ── Public token-gated pages (bypass both setup and auth gates) ─────
  // These must be checked before the setup redirect — a user who received
  // a reset/invite link must be able to reach the page even if the setup
  // cookie is missing (e.g. cleared browser, different device).
  if (pathname.startsWith("/admin/reset-password")) {
    return NextResponse.next();
  }
  if (pathname === "/admin/forgot-password") {
    return NextResponse.next();
  }
  if (pathname.startsWith("/admin/confirm-email")) {
    return NextResponse.next();
  }

  // ── Setup wizard routing ────────────────────────────────────────────
  if (pathname === "/admin/setup" || pathname.startsWith("/admin/setup/")) {
    if (setupDone) {
      // Wizard already completed — lock it out. When hide-admin is on
      // and the visitor is unauth, route to the active slug so they
      // don't bounce into the 404'd /admin.
      const lockoutTarget = !req.auth && adminSlug !== "/admin" ? adminSlug : "/admin";
      return NextResponse.redirect(new URL(lockoutTarget, req.url));
    }
    // Wizard accessible without auth during first-run.
    return NextResponse.next();
  }

  if (!setupDone) {
    // Setup not done — force every /admin/* request to the wizard.
    return NextResponse.redirect(new URL("/admin/setup", req.url));
  }

  // ── Normal auth gating ─────────────────────────────────────────────
  if (pathname === "/admin/login") {
    if (req.auth) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    // Hide-admin: when slug != "/admin", route the unauth visitor to the
    // hidden slug instead of exposing /admin/login. The decideHideAdminAction
    // branch above already 404'd unauth requests to /admin/*; this only fires
    // for the allowlisted paths that reach this far AND happen to need a login.
    const loginPath = adminSlug === "/admin" ? "/admin/login" : adminSlug;
    const loginUrl = new URL(loginPath, req.url);
    if (pathname !== "/admin") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Role gate: admin-only routes bounce non-admins to the dashboard. The
  // sidebar already hides these items via `adminOnly` group flags, but URL
  // typing would still reach the page without this check.
  if (isAdminOnlyRoute(pathname)) {
    const roles = req.auth.user?.roles ?? [];
    if (!roles.includes("admin")) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Broader than admin/* now that redirects need to fire on public paths
  // too. Excludes Next internals, API routes, and the root favicon — these
  // never carry user-defined redirects and don't need admin gating.
  // Next 16's proxy always runs on Node runtime; `matchRedirect` can hit
  // the libSQL client directly without an edge-safe shim.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico).*)"],
};
