import { NextResponse } from "next/server";
import { db } from "@core/db/instance";

/**
 * Post-reset landing — clears every Auth.js session cookie variant on a
 * NextResponse.redirect to /admin/setup. The destructive part of the
 * reset happens in the server action; this handler exists because
 * cookies() from next/headers does not reliably attach Set-Cookie to a
 * server-action response (same class of bug /admin/force-logout/route.ts
 * already handles for the freshness gate).
 *
 * Gated by reading system.setup_complete: it must be false (i.e., we
 * actually are in a post-reset state). Otherwise this would be an
 * unauthenticated way for anyone to log out arbitrary admins.
 */
// Relative Location: behind the Dokploy/Traefik proxy `req.url` is the
// container's internal origin (localhost:3000), so absolute redirects built
// from it leak that host to the browser. See /admin/force-logout/route.ts.
function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET() {
  let setupComplete = true;
  try {
    const r = await db().execute({
      sql: "SELECT value FROM site_settings WHERE key = 'system.setup_complete' AND tenant_id = 1 LIMIT 1",
      args: [],
    });
    const v = r.rows[0]?.value as string | number | boolean | null | undefined;
    setupComplete = v === "true" || v === true || v === "1" || v === 1;
  } catch {
    // No row at all means setup is fundamentally not done — treat as post-reset.
    setupComplete = false;
  }

  if (setupComplete) {
    return relativeRedirect("/admin");
  }

  const res = relativeRedirect("/admin/setup");

  res.cookies.delete("authjs.session-token");
  res.cookies.delete("__Secure-authjs.session-token");
  for (let i = 0; i < 10; i += 1) {
    res.cookies.delete(`authjs.session-token.${i}`);
    res.cookies.delete(`__Secure-authjs.session-token.${i}`);
  }

  return res;
}
