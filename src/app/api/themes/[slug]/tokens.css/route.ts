import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { buildThemeTokensCss } from "@core-plugins/themes/tokens-css";

/**
 * Emit CSS custom properties built from a theme's `brand_*` settings.
 *
 * The generation logic lives in `@core-plugins/themes/tokens-css` so the
 * same tokens can be inlined into the document head by `renderActiveTheme`
 * (which is what public pages actually use now — inlining avoids a
 * render-blocking request). This route remains for tooling / preview and
 * for any saved theme data that still references `/api/themes/<slug>/tokens.css`.
 *
 * Cache short so settings edits propagate quickly; the settings save
 * action revalidates this path explicitly. The empty (cold-start) body is
 * never cached — see below.
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

  const built = await buildThemeTokensCss(db(), slug);
  const hasTokens = built.length > 0;
  const body = hasTokens ? built : "/* no theme tokens set */\n";
  // Don't cache the empty body. An early-cold-start request that hits before
  // the plugin registry has finished registering its settings would otherwise
  // pin the "no tokens" fallback (teal) at the edge for minutes. Cache only
  // on success.
  const cacheControl = hasTokens
    ? "public, max-age=60, s-maxage=300, stale-while-revalidate=300"
    : "no-store";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}
