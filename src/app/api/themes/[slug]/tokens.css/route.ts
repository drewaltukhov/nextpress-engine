import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting, listDefinitions } from "@core-plugins/settings/registry";

/**
 * Emit CSS custom properties built from a theme's settings.
 *
 * For every setting key matching `theme.<slug>.brand_<name>` we emit
 * **two** declarations:
 *
 *   --np-brand-<name>:    <value>  (theme-component facing token)
 *   --color-brand-<name>: <value>  (Tailwind 4 @theme override)
 *
 * The second one is what actually changes the look of utility classes
 * like `bg-brand-light-green` or `text-brand-navy` — Tailwind 4 reads
 * the `--color-brand-*` custom properties at use-site, so writing them
 * on `:root` overrides the @theme defaults declared in globals.css.
 * Without this override, a theme setting like "Light brand color"
 * would only surface in components that read `--np-brand-*` directly,
 * which is rarely what users expect.
 *
 * Cache short so settings edits propagate quickly; the settings save
 * action revalidates this path explicitly.
 */
interface Params {
  params: Promise<{ slug: string }>;
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

// Allow only chars safe inside CSS values: letters, digits, #, basic
// punctuation. Settings already validate hex colors at write time, so
// the typical case is safe; this is defense-in-depth.
function sanitizeValue(v: string): string {
  return v.replace(/[^A-Za-z0-9#%./_\- ]/g, "");
}

// When a setting key suffix doesn't share a name with the Tailwind 4
// @theme color token it's meant to drive, list the extra
// `--color-brand-<alias>` names to mirror onto. Without this, e.g. the
// "Primary accent color" setting (key suffix `primary`) only writes
// `--color-brand-primary`, which no Tailwind utility reads — so the
// `bg-brand-green` / `text-brand-green` utilities littered across the
// theme stay on the globals.css default and ignore the user's pick.
const COLOR_BRAND_ALIASES: Record<string, readonly string[]> = {
  primary: ["green"],
};

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid theme slug" }, { status: 400 });
  }

  // Walk the registered settings and pick the brand_* keys for this
  // theme. `listDefinitions(group)` returns just the registry entries
  // whose `group` matches — themes use `theme.<slug>.brand` for color
  // tokens (per NextPresso's register hook).
  const prefix = `theme.${slug}.brand_`;
  const defs = listDefinitions(`theme.${slug}.brand`).filter((d) => d.key.startsWith(prefix));

  const lines: string[] = [];
  for (const def of defs) {
    const raw = await getSetting<string>(db(), def.key);
    if (typeof raw !== "string" || raw.length === 0) continue;
    const tokenName = def.key.slice(prefix.length).replaceAll("_", "-");
    const safe = sanitizeValue(raw);
    lines.push(`  --np-brand-${tokenName}: ${safe};`);
    // Mirror onto the Tailwind 4 @theme color token so utilities like
    // `bg-brand-light-green` or `text-brand-navy` reflect the user's
    // pick. When a setting key has no matching Tailwind token (e.g.
    // `brand_primary`, which has no `--color-brand-primary`), the
    // mirror is harmless — Tailwind just doesn't read it.
    lines.push(`  --color-brand-${tokenName}: ${safe};`);
    // Cross-name aliases for settings whose key suffix doesn't match the
    // Tailwind utility they're meant to drive (see COLOR_BRAND_ALIASES).
    for (const alias of COLOR_BRAND_ALIASES[tokenName] ?? []) {
      lines.push(`  --color-brand-${alias}: ${safe};`);
    }
  }

  const hasTokens = lines.length > 0;
  const body = hasTokens ? `:root {\n${lines.join("\n")}\n}\n` : "/* no theme tokens set */\n";
  // Don't cache the empty body. An early-cold-start request that hits before
  // the plugin registry has finished registering its settings will see no
  // definitions and return empty — if that response gets cached at the Vercel
  // edge (s-maxage=300, stale-while-revalidate=300), every viewer routed to
  // that POP gets the "no tokens" body for up to 5–10 minutes, with the
  // visible effect of the page rendering with the theme.css fallback colors
  // (teal) instead of the user's chosen brand colors. Cache only on success.
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
