/**
 * Public search route. Resolves `/search?q=<query>&page=<n>` and renders
 * the active theme's `search-results` template. The route owns the
 * search execution; the SearchResults block reads the pre-fetched hits
 * from `puck.metadata.searchResults` and slices them per its own
 * `resultsPerPage` prop.
 */
import type { Metadata } from "next";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { DisableRightClick } from "@core/components/DisableRightClick";
import { ImageLightboxMounter } from "@core-plugins/pages/blocks/ImageLightboxMounter";
import { searchPublishedContent } from "@core/search/search-actions";
import { renderActiveTheme } from "@core-plugins/themes";
import { renderTitleFormat } from "@core-plugins/seo/metadata";

// Search-result HTML caches per (?q, ?page) variant for 60s; proxy handles
// setup/IP/maintenance gates. Search is non-indexable so the cache layer
// is just a perf win for repeat-query users.
export const revalidate = 60;

interface RouteParams {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export async function generateMetadata({ searchParams }: RouteParams): Promise<Metadata> {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim();
  const [siteTitle, siteTagline, siteUrl, titleFormat] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    getSetting<string>(db(), "site.url"),
    getSetting<string>(db(), "seo.title_format"),
  ]);
  const headline = q ? `Search results for "${q}"` : "Search";
  const title = renderTitleFormat(titleFormat ?? "%title% | %site%", {
    pageTitle: headline,
    siteTitle: siteTitle ?? "NextPress",
    siteTagline: siteTagline ?? "",
  });
  const canonical = siteUrl ? `${siteUrl.replace(/\/$/, "")}/search` : "/search";
  return {
    title: { absolute: title },
    alternates: { canonical },
    // Search-result pages are intentionally non-indexable: they're a
    // function of the query string, so every variant becomes a thin
    // duplicate from the crawler's POV.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: RouteParams) {
  // Setup-cookie, IP block, and maintenance gates run in proxy.
  const sp = await searchParams;
  const query = firstParam(sp.q).trim();
  const pageNum = Math.max(1, Number.parseInt(firstParam(sp.page), 10) || 1);

  const results = query.length > 0 ? await searchPublishedContent(query) : [];

  const disableRightClick =
    (await getSetting<boolean>(db(), "content.disable_right_click")) ?? false;

  const themed = await renderActiveTheme({
    templateId: "search-results",
    searchQuery: query,
    searchPage: pageNum,
    searchResults: results,
    // Sidebar PostsGrid widgets share the same `?page` param as the
    // SearchResults block — keeps one Prev/Next set per route.
    postsPage: pageNum,
    routePath: "/search",
  });
  if (themed) {
    return (
      <>
        {themed.head}
        {themed.body}
        {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
      </>
    );
  }

  // Minimal fallback — no active theme. Render a plain list.
  return (
    <main className="min-h-screen bg-white">
      <article className="mx-auto max-w-3xl px-6 py-10 prose prose-slate">
        <h1>{query ? `Search results for "${query}"` : "Search"}</h1>
        {query && results.length === 0 ? <p>No matches found.</p> : null}
        <ul>
          {results.map((hit) => (
            <li key={hit.key}>
              <a href={hit.url}>{hit.title}</a>
              <span> · {hit.kind}</span>
            </li>
          ))}
        </ul>
      </article>
      {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
    </main>
  );
}
