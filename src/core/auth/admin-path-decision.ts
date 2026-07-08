/**
 * Pure routing-decision helper for hide-admin.
 *
 * Given the current request path, the active admin slug, and whether the
 * caller is authenticated, return the action the proxy should take. The
 * proxy turns the action into a NextResponse — this function has no
 * runtime dependencies so it's trivially testable.
 *
 * Rules (slug !== "/admin"):
 *   1. pathname === slug          → rewrite /admin/login   (unauth)
 *                                  → redirect /admin       (auth)
 *   2. pathname === "/admin" or "/admin/login" (unauth)
 *                                  → 404
 *   3. pathname starts with "/admin/" (unauth) AND not in allowlist
 *                                  → 404
 *   4. otherwise                   → pass
 *
 * Allowlist preserves email-link flows + first-run setup. Setup is locked
 * once complete (see src/proxy.ts), so the allowlist is safe there.
 */

const ALLOWLIST_PREFIXES = [
  "/admin/reset-password",
  "/admin/forgot-password",
  "/admin/confirm-email",
  "/admin/setup",
];

function isAllowlisted(pathname: string): boolean {
  for (const p of ALLOWLIST_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export type HideAdminAction =
  | { kind: "pass" }
  | { kind: "block" }
  | { kind: "rewrite"; target: string }
  | { kind: "redirect"; target: string };

interface DecideInput {
  pathname: string;
  slug: string;
  isAuth: boolean;
}

export function decideHideAdminAction({ pathname, slug, isAuth }: DecideInput): HideAdminAction {
  if (slug === "/admin") return { kind: "pass" };

  if (pathname === slug) {
    return isAuth
      ? { kind: "redirect", target: "/admin" }
      : { kind: "rewrite", target: "/admin/login" };
  }

  if (isAuth) return { kind: "pass" };

  if (pathname === "/admin" || pathname === "/admin/login") {
    return { kind: "block" };
  }

  if (pathname.startsWith("/admin/")) {
    if (isAllowlisted(pathname)) return { kind: "pass" };
    return { kind: "block" };
  }

  return { kind: "pass" };
}
