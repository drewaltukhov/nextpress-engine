import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

// Minimal Web App Manifest. Lets Android Chrome treat the site as an
// installable PWA (Add to Home Screen), and tells iOS the title /
// theme color to use on the splash screen. We point at the file-route
// icons (/icon.svg, /apple-icon) Next.js auto-generates so there is
// no duplicate icon registry to keep in sync.
export async function GET() {
  const [siteTitle, siteTagline] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
  ]);

  const title = siteTitle?.trim() || "NextPress";
  const description = siteTagline?.trim() || "A modular Next.js posting engine.";

  const manifest = {
    name: title,
    short_name: title.length > 12 ? title.slice(0, 12) : title,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#2A3A5B",
    background_color: "#f8fafc",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
