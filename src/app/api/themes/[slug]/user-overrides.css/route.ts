import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { buildUserOverridesCss } from "@core-plugins/themes/user-overrides-css";

/**
 * Serve the active per-theme custom CSS as a single stylesheet built from
 * three breakpoint-scoped settings (see `buildUserOverridesCss`).
 *
 * The theme `<head>` no longer links this — it inlines the same body as a
 * `<style>` (see `renderActiveTheme`). The route stays for anything that
 * still references the URL. The URL is fixed (unversioned), so Cache-Control
 * stays short and edits propagate within minutes — the settings save
 * action's revalidatePath cannot purge browser or CDN copies.
 */
interface Params {
  params: Promise<{ slug: string }>;
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid theme slug" }, { status: 400 });
  }
  const body = await buildUserOverridesCss(db(), slug);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
