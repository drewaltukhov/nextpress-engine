// Namespace import on purpose: this module is reachable from the Middleware
// (proxy.ts → ip-access) and Instrumentation bundles, where Turbopack rejects a
// NAMED `revalidateTag` import at build time. Neither runtime ever invalidates
// (writes happen in Server Actions / Route Handlers), and every call below is
// inside try/catch, so reaching it as a property is safe.
import * as nextCache from "next/cache";

/**
 * Expire a Next.js data-cache tag immediately, from ANY server context.
 *
 * Every `unstable_cache` service (posts, pages, topics, menus, settings,
 * redirects, theme, plugins, roles, user session, IP access) invalidates
 * through here. Don't call `updateTag` directly — a guard test enforces it.
 *
 * Why two calls: `updateTag` gives read-your-own-writes but Next 16 only
 * allows it inside a Server Action; in a Route Handler (the v1 API,
 * /api/cache/purge) it throws. Those callers used to swallow
 * the throw, so API writes stayed stale for the full `revalidate` TTL (300s)
 * and an editor opened in that window could save the old copy back over the
 * new one.
 *
 * `revalidateTag(tag, { expire: 0 })` is allowed in Route Handlers and is
 * immediate too: Next treats `expire: 0` like `updateTag`'s no-profile path
 * (see next/dist/server/web/spec-extension/revalidate.js), so the next read
 * misses instead of serving one more stale copy as the "max" profile would.
 *
 * Outside any request (a CLI script) both throw — the in-process caches the
 * callers clear themselves are all that can be done there, so that is
 * swallowed, as before.
 */
export function invalidateCacheTag(tag: string): void {
  try {
    nextCache.updateTag(tag);
    return;
  } catch {
    // Not a Server Action (Route Handler, render, script) — fall through.
  }
  try {
    nextCache.revalidateTag(tag, { expire: 0 });
  } catch {
    // No request/work store (CLI script, test): nothing more to expire.
  }
}
