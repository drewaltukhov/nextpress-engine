import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { SearchResultItem } from "@core/search/search-actions";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { toFeaturedThumbVariant } from "@core-plugins/media/storage/url";
import {
  Pagination,
  type PaginationAlign,
  type PaginationStyle,
  type PaginationType,
} from "./Pagination";

export type SearchPaginationStyle = PaginationStyle;
export type SearchPaginationAlign = PaginationAlign;
export type SearchPaginationType = PaginationType;

export type SearchResultsProps = {
  /** How many hits per page. Inserted into the URL via `?page=`. */
  resultsPerPage: number;
  /** Render the post's featured image as a thumbnail next to the
   *  title. Pages don't carry a featured image; their thumbnail slot
   *  stays empty even when this is on. */
  showThumbnails: boolean;
  /** "arrows" → `‹ Prev    Next ›`. "numbered" → `‹ 1 2 … 9 10 ›`
   *  (truncated when more than 7 pages). */
  paginationStyle: SearchPaginationStyle;
  /** "buttons" → bordered, padded buttons. "links" → plain underlined
   *  text links. */
  paginationType: SearchPaginationType;
  paginationAlign: SearchPaginationAlign;
};

interface PuckMetadataShape {
  searchQuery?: string;
  searchPage?: number;
  searchResults?: SearchResultItem[];
}

export const SearchResults: ComponentConfig<SearchResultsProps> = {
  label: "Search Results",
  permissions: { delete: false, duplicate: false },
  fields: {
    resultsPerPage: {
      type: "number",
      label: "Results per page",
      min: 1,
      max: 50,
      step: 1,
    },
    showThumbnails: {
      type: "radio",
      label: "Show thumbnails",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    paginationStyle: {
      type: "radio",
      label: "Pagination",
      options: [
        { label: "Prev / Next only", value: "arrows" },
        { label: "Numbered (truncated)", value: "numbered" },
      ],
    },
    paginationType: {
      type: "radio",
      label: "Pagination style",
      options: [
        { label: "Buttons", value: "buttons" },
        { label: "Plain links", value: "links" },
      ],
    },
    paginationAlign: {
      type: "radio",
      label: "Pagination alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
  },
  defaultProps: {
    resultsPerPage: 10,
    showThumbnails: true,
    paginationStyle: "numbered",
    paginationType: "buttons",
    paginationAlign: "center",
  },
  render: ({ resultsPerPage, showThumbnails, paginationStyle, paginationType, paginationAlign, puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="SearchResults"
          title="Search Results"
          description={`${resultsPerPage} per page · ${paginationStyle === "arrows" ? "Prev / Next" : "Numbered"} pagination`}
        />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const query = md.searchQuery?.trim() ?? "";
    const allResults = md.searchResults ?? [];
    const safePerPage = Number.isFinite(resultsPerPage) && resultsPerPage > 0
      ? Math.min(50, Math.max(1, Math.floor(resultsPerPage)))
      : 10;
    const totalPages = Math.max(1, Math.ceil(allResults.length / safePerPage));
    const currentPage = Math.min(
      totalPages,
      Math.max(1, Math.floor(md.searchPage ?? 1)),
    );
    const start = (currentPage - 1) * safePerPage;
    const slice = allResults.slice(start, start + safePerPage);

    if (query.length === 0) {
      return (
        <section className="np-search-results not-prose mb-6">
          <h1 className="mb-2 text-2xl font-semibold text-brand-navy">Search</h1>
          <p className="text-sm text-slate-500">
            Type a query in the search bar to see matching pages and posts.
          </p>
        </section>
      );
    }

    return (
      <section className="np-search-results not-prose mb-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold text-brand-navy">
            Search results for <span className="text-brand-green">&ldquo;{query}&rdquo;</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {allResults.length === 0
              ? "No matches found."
              : `${allResults.length} match${allResults.length === 1 ? "" : "es"}.`}
          </p>
        </header>

        {slice.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {slice.map((hit) => (
              <li key={hit.key}>
                <a href={hit.url} className="flex items-start gap-4 p-4 transition hover:bg-slate-50">
                  {showThumbnails !== false ? (
                    <div className="size-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
                      {hit.featuredImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={toFeaturedThumbVariant(hit.featuredImage) ?? hit.featuredImage}
                          alt=""
                          className="h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {hit.kind}
                      </span>
                      <h2 className="text-base font-medium text-slate-900">{hit.title}</h2>
                    </div>
                    {hit.snippet ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {hit.snippet.before}
                        <mark className="rounded bg-yellow-100 px-0.5 text-slate-900">
                          {hit.snippet.match}
                        </mark>
                        {hit.snippet.after}
                      </p>
                    ) : hit.excerpt ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{hit.excerpt}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">{hit.url}</p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {totalPages > 1 ? (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            linkFor={(p) => `/search?q=${encodeURIComponent(query)}&page=${p}`}
            style={paginationStyle}
            type={paginationType ?? "buttons"}
            align={paginationAlign ?? "center"}
          />
        ) : null}
      </section>
    );
  },
};

export const SearchResultsBlock: Omit<RegisteredBlock, "source"> = {
  name: "SearchResults",
  config: SearchResults,
  surfaces: ["template-search-results"],
  category: "Template",
  essential: true,
};
