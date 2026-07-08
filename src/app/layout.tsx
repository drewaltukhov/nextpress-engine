import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-loaded"
});

// Brand-token theme colors. Light variant uses the off-white surface
// the public site renders on; dark variant uses the brand navy so the
// browser chrome on iOS / Android matches when a user installs the
// PWA or pins the site.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#2A3A5B" },
  ],
  colorScheme: "light dark",
};

export async function generateMetadata(): Promise<Metadata> {
  // Search-engine verification meta tags belong on every public route, so
  // we set them once in the root layout. Per-page metadata can still
  // override `verification` (no current route does), but everything that
  // lands here — homepage, /<slug>, /<pillar>/<spike>, /topics/<slug>,
  // /search, /author/<username>, /docs, /404 — inherits the same tokens.
  //
  // The settings read is wrapped because this metadata runs at BUILD
  // time for every prerendered route (notably /docs/*). If the DB is
  // mid-mirror or otherwise unreachable when Vercel builds, missing the
  // verification tokens is preferable to crashing the entire build —
  // these tags are optional SEO niceties, not load-bearing content.
  let verGoogle: string | null = null;
  let verBing: string | null = null;
  let verYandex: string | null = null;
  let verPinterest: string | null = null;
  try {
    [verGoogle, verBing, verYandex, verPinterest] = await Promise.all([
      getSetting<string>(db(), "seo.verification_google"),
      getSetting<string>(db(), "seo.verification_bing"),
      getSetting<string>(db(), "seo.verification_yandex"),
      getSetting<string>(db(), "seo.verification_pinterest"),
    ]);
  } catch {
    // DB unavailable (e.g. mid-migration during deploy) — fall through
    // with empty tokens so the prerender doesn't fail.
  }

  const other: Record<string, string> = {};
  if (verBing) other["msvalidate.01"] = verBing;
  if (verPinterest) other["p:domain_verify"] = verPinterest;

  return {
    title: {
      default: "NextPress",
      template: "NextPress - %s",
    },
    description: "A modular Next.js posting engine.",
    // RSS autodiscovery — feed readers (and most browsers) honour the
    // <link rel="alternate"> tag in the document head. We already serve
    // a well-formed feed at /rss.xml; this just advertises it.
    alternates: {
      types: {
        "application/rss+xml": "/rss.xml",
      },
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "NextPress",
      statusBarStyle: "default",
    },
    verification: {
      google: verGoogle || undefined,
      yandex: verYandex || undefined,
      ...(Object.keys(other).length > 0 ? { other } : {}),
    },
  };
}

// fumadocs-ui's `RootProvider` is intentionally NOT here. It wraps a
// next-themes inline `<script>` (no `type` attribute) which trips React
// 19's "Encountered a script tag while rendering React component"
// warning on every client render of every route — most loudly on 404
// pages where the warning is the loudest visible thing. Scope it to
// `/docs` instead (where it's actually needed for search + theme).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable} suppressHydrationWarning>
      <body className="antialiased">
        {/* RSS autodiscovery emitted as a literal <link> here (React 19
         * hoists it into <head>) because the Next Metadata `alternates`
         * field is shallow-merged: every page that sets its own
         * `alternates: { canonical }` would wipe a root-layout types
         * entry. This guarantees the feed link appears on every route. */}
        <link rel="alternate" type="application/rss+xml" title="NextPress" href="/rss.xml" />
        {/* Skip-to-content link — visually hidden until focused. WCAG
         * 2.4.1 (Bypass Blocks): first focusable element on the page so
         * keyboard users can jump past the nav. Pages render their own
         * `<main>`; the `#main-content` wrapper below guarantees a
         * stable focus target regardless of which theme/route is active. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:rounded-md focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-brand-green"
        >
          Skip to main content
        </a>
        <div id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </div>
      </body>
    </html>
  );
}
