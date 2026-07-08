/**
 * Shared pagination component used by SearchResults and PostsGrid.
 * Pure JSX (no hooks) so the file is safe to import from any block
 * render path — server, client, or the editor preview.
 *
 * The host widget owns the page-link URL shape; it passes a
 * `linkFor(page) => string` callback rather than baking a route
 * convention in here.
 */

export type PaginationStyle = "arrows" | "numbered";
export type PaginationAlign = "left" | "center" | "right";
export type PaginationType = "buttons" | "links";

const ALIGN_JUSTIFY: Record<PaginationAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Build the URL for a given page number. Each host (search /
   *  posts grid / future widgets) baked their own `?page=N`
   *  convention with the rest of the URL kept intact. */
  linkFor: (page: number) => string;
  style: PaginationStyle;
  type: PaginationType;
  align: PaginationAlign;
  /** Optional override for the prev / next labels, e.g. localised
   *  strings. Defaults to `‹ Prev` / `Next ›`. */
  prevLabel?: string;
  nextLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  linkFor,
  style,
  type,
  align,
  prevLabel = "‹ Prev",
  nextLabel = "Next ›",
}: PaginationProps) {
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  // Two visual flavors. `buttons` keeps the bordered, padded look;
  // `links` falls back to plain underlined text inline with the
  // surrounding copy. Class strings are referenced as literals so
  // Tailwind's purge keeps them.
  const buttonBase =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium transition";
  const buttonEnabled = "text-slate-700 hover:bg-slate-50 hover:border-slate-300";
  const buttonDisabled = "text-slate-300 cursor-not-allowed";
  const buttonActive = "border-brand-green bg-brand-light-green text-brand-navy";

  const linkBase = "inline-flex items-center px-1 text-sm transition";
  const linkEnabled = "text-slate-600 underline underline-offset-2 hover:text-brand-green";
  const linkDisabled = "text-slate-300 cursor-not-allowed";
  const linkActive = "font-semibold text-brand-navy";

  const isButtons = type === "buttons";
  const baseCls = isButtons ? buttonBase : linkBase;
  const enabledCls = isButtons ? buttonEnabled : linkEnabled;
  const disabledCls = isButtons ? buttonDisabled : linkDisabled;
  const activeCls = isButtons ? buttonActive : linkActive;
  const gapCls = isButtons ? "gap-2" : "gap-3";

  return (
    <nav
      aria-label="Pagination"
      className={`mt-6 flex flex-wrap items-center ${gapCls} ${ALIGN_JUSTIFY[align]}`}
    >
      {prevDisabled ? (
        <span className={`${baseCls} ${disabledCls}`} aria-hidden>
          {prevLabel}
        </span>
      ) : (
        <a href={linkFor(currentPage - 1)} className={`${baseCls} ${enabledCls}`}>
          {prevLabel}
        </a>
      )}

      {style === "numbered"
        ? buildPageList(currentPage, totalPages).map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e-${i}`} className="px-1 text-slate-400">…</span>
            ) : p === currentPage ? (
              <span
                key={p}
                aria-current="page"
                className={`${baseCls} ${activeCls}`}
              >
                {p}
              </span>
            ) : (
              <a key={p} href={linkFor(p)} className={`${baseCls} ${enabledCls}`}>
                {p}
              </a>
            ),
          )
        : null}

      {nextDisabled ? (
        <span className={`${baseCls} ${disabledCls}`} aria-hidden>
          {nextLabel}
        </span>
      ) : (
        <a href={linkFor(currentPage + 1)} className={`${baseCls} ${enabledCls}`}>
          {nextLabel}
        </a>
      )}
    </nav>
  );
}

/**
 * Build a truncated page list like `[1, 2, "ellipsis", 9, 10]`.
 * Always shows first + last; up to 2 neighbors around the current
 * page; fills with ellipses where pages are skipped. Total items
 * capped at 7 so the row stays compact.
 */
export function buildPageList(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: Array<number | "ellipsis"> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("ellipsis");
  for (let p = left; p <= right; p++) out.push(p);
  if (right < total - 1) out.push("ellipsis");
  out.push(total);
  return out;
}
