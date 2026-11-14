import type { DbClient } from "@core/db/client";
import { getSetting, listDefinitions } from "@core-plugins/settings/registry";

/**
 * Build the `:root { … }` CSS-custom-property block from a theme's
 * `theme.<slug>.brand_*` settings. Shared by the `tokens.css` API route
 * and `renderActiveTheme`, which inlines the result into a `<style>` in
 * the document head — inlining removes a render-blocking request. It does
 * not fully remove the cold-start "empty tokens got edge-cached" problem
 * the standalone route guards against: public HTML is CDN-cached
 * (`s-maxage=60` + stale-while-revalidate, see src/proxy.ts), so a page
 * rendered while settings were empty can show fallback colours until that
 * copy expires — minutes, not the route's old 5+5.
 *
 * For every `brand_<name>` setting we emit two declarations:
 *   --np-brand-<name>    — theme-component-facing token
 *   --color-brand-<name> — Tailwind 4 @theme override (drives utilities
 *                          like `bg-brand-light-green`)
 * plus any cross-name aliases (see COLOR_BRAND_ALIASES).
 *
 * Returns "" when the theme has no brand tokens set.
 */

const COLOR_BRAND_ALIASES: Record<string, readonly string[]> = {
  primary: ["green"],
};

// Allow only chars safe inside a CSS value. Settings validate hex colors
// at write time; this is defense-in-depth and, critically, guarantees the
// output can never contain `<` — so the string is safe to inline verbatim
// inside a `<style>` element.
function sanitizeValue(v: string): string {
  return v.replace(/[^A-Za-z0-9#%./_\- ]/g, "");
}

export async function buildThemeTokensCss(db: DbClient, slug: string): Promise<string> {
  const prefix = `theme.${slug}.brand_`;
  const defs = listDefinitions(`theme.${slug}.brand`).filter((d) => d.key.startsWith(prefix));

  const lines: string[] = [];
  for (const def of defs) {
    const raw = await getSetting<string>(db, def.key);
    if (typeof raw !== "string" || raw.length === 0) continue;
    const tokenName = def.key.slice(prefix.length).replaceAll("_", "-");
    const safe = sanitizeValue(raw);
    lines.push(`  --np-brand-${tokenName}: ${safe};`);
    lines.push(`  --color-brand-${tokenName}: ${safe};`);
    for (const alias of COLOR_BRAND_ALIASES[tokenName] ?? []) {
      lines.push(`  --color-brand-${alias}: ${safe};`);
    }
  }

  return lines.length > 0 ? `:root {\n${lines.join("\n")}\n}\n` : "";
}
