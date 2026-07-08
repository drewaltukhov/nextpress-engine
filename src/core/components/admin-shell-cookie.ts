/**
 * Plain shared module — must not have a `"use client"` directive. Exports
 * a string constant used by both the server-side admin layout (to read the
 * cookie) and the client-side AdminShellProvider (to write it). When this
 * lived inside `AdminShellContext.tsx` (which has `"use client"`),
 * Next.js's server-to-client boundary turned the constant into `undefined`
 * on the server, so server-side `cookies().get(SIDEBAR_COOKIE)` returned
 * nothing even though the cookie was present in the request.
 */
export const SIDEBAR_COOKIE = "np_admin_sidebar";
