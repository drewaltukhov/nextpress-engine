import type { ReactNode } from "react";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { getMenuByLocation } from "@core-plugins/menus";

/**
 * Minimal site shell shown when no theme is active. Closes #46.
 *
 * Sections (centered, stacked, 1rem gaps):
 *   1. Site title + tagline
 *   2. Primary navigation (from the menu at location `primary`)
 *   3. Separator
 *   4. Page/post/topic title
 *   5. Optional meta line (byline + date)
 *   6. Optional featured image (16:9)
 *   7. Body content
 *   8. Footer — © YEAR Site Title
 *
 * Routes wrap their fallback render in this shell so unthemed sites get
 * a consistent, presentable look without needing to install a theme.
 */
export interface UnthemedShellProps {
  title: string;
  /** Optional featured image src — rendered 16:9 above the body. */
  featuredImage?: string | null;
  /** Optional meta line (e.g. byline + date) shown below the title. */
  meta?: ReactNode;
  /** Body — usually the rendered post/page content. */
  children: ReactNode;
}

interface ShellChrome {
  siteTitle: string;
  siteTagline: string;
  navItems: { label: string; url: string; target: "_self" | "_blank" }[];
}

async function loadShellChrome(): Promise<ShellChrome> {
  const [siteTitle, siteTagline, menu] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    // `getMenuByLocation` returns `null` when the menu doesn't exist;
    // fail soft so the shell still renders without a primary menu.
    getMenuByLocation(db(), "primary").catch(() => null),
  ]);

  // Top-level only — nested children would need a dropdown affordance
  // we deliberately don't ship in the unthemed shell. Themed sites use
  // the NavMenu block for that.
  const navItems = (menu?.items ?? [])
    .filter((it) => it.parentId == null)
    .map((it) => ({
      label: it.label,
      url: it.url,
      target: it.target === "_blank" ? ("_blank" as const) : ("_self" as const),
    }));

  return {
    siteTitle: siteTitle ?? "NextPress",
    siteTagline: siteTagline ?? "",
    navItems,
  };
}

export async function UnthemedShell({
  title,
  featuredImage,
  meta,
  children,
}: UnthemedShellProps) {
  const chrome = await loadShellChrome();
  const year = new Date().getUTCFullYear();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-6 sm:px-6 sm:py-10">
        {/* Header — title/desc, nav, separator */}
        <header className="flex w-full flex-col items-center gap-3 sm:gap-4">
          <div className="text-center">
            <a href="/" className="block no-underline">
              <h1 className="font-display text-2xl tracking-tight text-slate-900 sm:text-3xl">
                {chrome.siteTitle}
              </h1>
            </a>
            {chrome.siteTagline ? (
              <p className="mt-1 text-sm text-slate-500">{chrome.siteTagline}</p>
            ) : null}
          </div>
          {chrome.navItems.length > 0 ? (
            <nav aria-label="Primary" className="w-full">
              <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm sm:gap-x-4 sm:gap-y-2">
                {chrome.navItems.map((item) => (
                  <li key={`${item.url}-${item.label}`}>
                    <a
                      href={item.url}
                      target={item.target}
                      rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                      className="text-slate-700 no-underline hover:text-brand-green"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <hr className="w-full border-t border-slate-200" />
        </header>

        {/* Page-specific content */}
        <article className="prose prose-slate prose-sm w-full max-w-none sm:prose-base">
          <h1 className="text-center text-2xl sm:text-3xl md:text-4xl">{title}</h1>
          {meta ? (
            <div className="not-prose mb-4 text-center text-sm text-slate-500">{meta}</div>
          ) : null}
          {featuredImage ? (
            <div className="not-prose mb-4 aspect-video w-full overflow-hidden rounded-lg bg-slate-100 sm:rounded-xl">
              {/* Featured image is an author-provided arbitrary URL; next/image's
                  domain allowlist would 404 for any unconfigured host. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={featuredImage}
                alt=""
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            </div>
          ) : null}
          {children}
        </article>

        {/* Footer */}
        <footer className="mt-6 w-full border-t border-slate-200 pt-4 text-center text-xs text-slate-500 sm:mt-8">
          © {year} {chrome.siteTitle}
        </footer>
      </div>
    </main>
  );
}
