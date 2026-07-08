import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * Serve the active per-theme custom CSS as a single stylesheet built
 * from three breakpoint-scoped settings:
 *
 *   - `theme.<slug>.user_overrides_css`         — desktop / base, emitted as-is
 *   - `theme.<slug>.user_overrides_css_tablet`  — wrapped in @media (max-width: 1023px)
 *   - `theme.<slug>.user_overrides_css_mobile`  — wrapped in @media (max-width: 767px)
 *
 * Breakpoints align with Tailwind `md` / `lg` and the per-widget hide
 * toggles. Public Cache-Control is short so edits propagate quickly;
 * the settings save action explicitly revalidates this path.
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
  const [desktop, tablet, mobile] = await Promise.all([
    getSetting<string>(db(), `theme.${slug}.user_overrides_css`),
    getSetting<string>(db(), `theme.${slug}.user_overrides_css_tablet`),
    getSetting<string>(db(), `theme.${slug}.user_overrides_css_mobile`),
  ]);
  const parts: string[] = [];
  if (typeof desktop === "string" && desktop.trim() !== "") {
    parts.push(desktop);
  }
  if (typeof tablet === "string" && tablet.trim() !== "") {
    parts.push(`@media (max-width: 1023px) {\n${tablet}\n}`);
  }
  if (typeof mobile === "string" && mobile.trim() !== "") {
    parts.push(`@media (max-width: 767px) {\n${mobile}\n}`);
  }
  const body = parts.join("\n\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
