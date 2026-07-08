/**
 * Routes that require the `admin` role. The sidebar already hides items in
 * `adminOnly` groups (see src/core/components/AdminSideNav.tsx), but typing
 * the URL directly would still reach the page; this matcher backs that up
 * at the middleware layer. Server actions on these pages enforce admin
 * separately — defense in depth.
 *
 * Editing this list means updating the matching `adminOnly: true` group
 * flag in AdminSideNav.tsx as well, so the two layers stay aligned.
 */
export const ADMIN_ONLY_ROUTE_PREFIXES = [
  "/admin/themes",
  "/admin/menus",
  "/admin/users",
  "/admin/roles",
  "/admin/plugins",
  "/admin/api-tokens",
  "/admin/redirects",
  "/admin/settings",
  "/admin/updates",
  "/admin/security",
  "/admin/logs",
  "/admin/backup",
  "/admin/reset",
] as const;

export function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
