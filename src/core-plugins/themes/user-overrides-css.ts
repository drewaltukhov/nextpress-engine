import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * Single source of truth for the per-theme custom CSS stylesheet.
 *
 * The CSS is assembled from three breakpoint-scoped settings:
 *
 *   - `theme.<slug>.user_overrides_css`         — desktop / base, emitted as-is
 *   - `theme.<slug>.user_overrides_css_tablet`  — wrapped in @media (max-width: 1023px)
 *   - `theme.<slug>.user_overrides_css_mobile`  — wrapped in @media (max-width: 767px)
 *
 * Both the public route (`/api/themes/<slug>/user-overrides.css`) and the
 * theme `<head>` builder (which inlines it via `rebaseCssUrls` +
 * `escapeInlineCss`) use this,
 * so the two can never drift.
 */
export async function buildUserOverridesCss(db: DbClient, slug: string): Promise<string> {
  const [desktop, tablet, mobile] = await Promise.all([
    getSetting<string>(db, `theme.${slug}.user_overrides_css`),
    getSetting<string>(db, `theme.${slug}.user_overrides_css_tablet`),
    getSetting<string>(db, `theme.${slug}.user_overrides_css_mobile`),
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
  return parts.join("\n\n");
}

/**
 * Make CSS safe to inline in a `<style>` element. Only `</` can end a
 * `<style>` element, so every `<` that starts `</` becomes the CSS hex escape
 * `\3c ` (the trailing space terminates the escape): the output contains no
 * `</` at all, so no input — however nested — can close the element. A bare
 * `<` is left alone because it is valid CSS in range queries
 * (`@media (width < 640px)`, `@container (inline-size < 30em)`). Inside a
 * CSS string the escape still decodes to `<`. Stripping `</style` instead is
 * bypassable (`</sty</stylele>` collapses back to `</style>`).
 */
export function escapeInlineCss(css: string): string {
  return css.replace(/<(?=\/)/g, "\\3c ");
}

/**
 * Rebase relative URLs in custom CSS onto `baseUrl` before it is inlined.
 * The CSS used to load from `/api/themes/<slug>/user-overrides.css`, so a
 * relative `url(images/bg.png)` resolved against `/api/themes/<slug>/`
 * (theme assets). Inlined into the page it would resolve against the
 * current document instead — differently on `/` and `/a/b` — so saved CSS
 * keeps its old meaning only if relative refs are prefixed here. Absolute
 * URLs, root-relative paths, `data:`/other schemes and `#fragment` refs are
 * left as-is. Covers `url(...)` (quoted or not) and `@import "..."`.
 */
export function rebaseCssUrls(css: string, baseUrl: string): string {
  const isRelative = (u: string) => u !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(u);
  return css
    // Three disjoint alternatives (double-quoted, single-quoted, bare) so
    // matching stays linear — no overlapping `\s*` groups to backtrack over.
    .replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"'\s)]+))\s*\)/gi,
      (match, dq?: string, sq?: string, bare?: string) => {
        const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : "";
        const ref = (dq ?? sq ?? bare ?? "").trim();
        return isRelative(ref) ? `url(${quote}${baseUrl}${ref}${quote})` : match;
      },
    )
    .replace(/@import\s+(["'])([^"']*)\1/gi, (match, quote: string, ref: string) =>
      isRelative(ref.trim()) ? `@import ${quote}${baseUrl}${ref.trim()}${quote}` : match,
    );
}
