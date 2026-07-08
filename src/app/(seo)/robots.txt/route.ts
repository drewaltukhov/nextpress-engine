import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { generateRobotsTxt } from "@core-plugins/seo/generators";
import { resolveSiteUrl } from "@core/site-url";

export const dynamic = "force-dynamic";

export async function GET() {
  const [siteUrl, customContent, discourageIndexing, discourageAiAgents] = await Promise.all([
    resolveSiteUrl(db()),
    getSetting<string>(db(), "seo.robots_custom"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
    getSetting<boolean>(db(), "seo.discourage_ai_agents"),
  ]);

  const isStaging =
    process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";

  const content = generateRobotsTxt({
    siteUrl,
    customContent,
    isStaging,
    discourageIndexing: discourageIndexing ?? false,
    discourageAiAgents: discourageAiAgents ?? false,
  });

  // The route is force-dynamic, so this CDN header is the only cache layer —
  // revalidatePath can't purge it. 1 hour bounds how long an admin toggle
  // (discourage indexing / AI agents) takes to reach crawlers.
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
