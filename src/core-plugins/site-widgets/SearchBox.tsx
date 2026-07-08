import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

// Inline SVG instead of `lucide-react` — `lucide-react` v1's Icon
// component is `"use client"` and calls `useContext` internally, which
// crashes Puck's <Render> in renderActiveTheme with
// "Cannot read properties of null (reading 'useContext')" because the
// public render path doesn't bridge client components through Next.js's
// RSC machinery. Same fix the SocialIcons block uses.
function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export type SearchBoxDisplay = "input" | "icon";
export type SearchBoxMobileDisplay = "same" | "input" | "icon" | "hidden";

/** Search results route — hardcoded since `/search` is the engine
 *  convention and there's nothing to gain from per-instance overrides
 *  (theme settings or routing changes target this URL too). */
const SEARCH_ACTION = "/search";

export type SearchBoxProps = {
  placeholder: string;
  /** Visual treatment:
   *   - `"input"` — inline search input (the original behavior; best
   *     for sidebars and full-width header columns).
   *   - `"icon"` — compact magnifying-glass button that opens a centered
   *     overlay with a large search input on click. Best for header
   *     chrome where horizontal space is tight.
   *  Powered by the native HTML Popover API (`popover="auto"` +
   *  `popovertarget`), so the open / close / Esc / click-outside / focus
   *  behavior is browser-native — no client JS, no React state. Stays
   *  inside Puck's RSC <Render> walk without bridging client
   *  components. */
  display: SearchBoxDisplay;
  /** Visual treatment below the `md` (768px) breakpoint:
   *   - `"same"` (default) — reuse the desktop `display`.
   *   - `"input"` / `"icon"` — force a specific variant at mobile.
   *   - `"hidden"` — drop the search box from mobile entirely (useful
   *     when the header row is already crowded). */
  mobileDisplay?: SearchBoxMobileDisplay;
  /** Auto-injected by Puck — every block has a stable string id. We
   *  use it to mint a per-instance popover id so multiple SearchBox
   *  instances on the same page (e.g. a header icon + a sidebar input)
   *  don't collide. */
  id?: string;
};

/** One rendered SearchBox variant. `wrapperClass` is applied to the
 *  outermost element so a caller can hide it at a breakpoint via
 *  Tailwind responsive classes. */
function renderVariant(
  variant: SearchBoxDisplay,
  placeholder: string,
  popoverId: string,
  wrapperClass: string,
): React.ReactElement {
  if (variant === "icon") {
    return (
      <span className={wrapperClass}>
        <button
          type="button"
          popoverTarget={popoverId}
          aria-label="Open search"
          title="Search"
          className="np-search-box np-search-box--icon not-prose inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 hover:text-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
        >
          <SearchGlyph className="size-4" />
        </button>
        <div
          id={popoverId}
          popover="auto"
          className="not-prose mx-auto mb-auto mt-[10vh] w-[min(640px,90vw)] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl [&::backdrop]:bg-black/40 sm:mt-[14vh]"
        >
          <form role="search" action={SEARCH_ACTION} method="get" className="relative flex w-full items-center">
            <SearchGlyph className="pointer-events-none absolute left-4 size-5 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder={placeholder}
              autoFocus
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
            />
          </form>
        </div>
      </span>
    );
  }

  return (
    <form
      role="search"
      action={SEARCH_ACTION}
      method="get"
      className={`np-search-box np-search-box--input not-prose relative mb-4 flex w-full items-center ${wrapperClass}`.trim()}
    >
      <SearchGlyph className="pointer-events-none absolute left-3 size-4 text-slate-400" />
      <input
        type="search"
        name="q"
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
      />
    </form>
  );
}

export const SearchBox: ComponentConfig<SearchBoxProps> = {
  label: "Search Box",
  fields: {
    display: {
      type: "radio",
      label: "Display",
      options: [
        { label: "Input field", value: "input" },
        { label: "Icon (opens search overlay)", value: "icon" },
      ],
    },
    placeholder: { type: "text", label: "Placeholder" },
    mobileDisplay: {
      type: "select",
      label: "Mobile display (<768px)",
      options: [
        { label: "Same as desktop", value: "same" },
        { label: "Input field", value: "input" },
        { label: "Icon (opens search overlay)", value: "icon" },
        { label: "Hidden", value: "hidden" },
      ],
    },
  },
  defaultProps: { placeholder: "Search…", display: "input", mobileDisplay: "same" },
  render: ({ placeholder, display, mobileDisplay, id, puck }) => {
    const desktop: SearchBoxDisplay = display ?? "input";
    const mobile: SearchBoxMobileDisplay = mobileDisplay ?? "same";

    if (puck?.isEditing) {
      const descParts = [
        desktop === "icon" ? "Icon overlay on desktop" : "Inline input on desktop",
      ];
      if (mobile === "hidden") descParts.push("hidden on mobile");
      else if (mobile !== "same" && mobile !== desktop) {
        descParts.push(`${mobile === "icon" ? "icon overlay" : "inline input"} on mobile`);
      }
      return (
        <BuilderCard
          name="SearchBox"
          title="Search Box"
          description={`${descParts.join("; ")}.`}
        />
      );
    }

    const ph = placeholder || "Search…";
    // Per-instance popover id (kept separate for desktop + mobile variants
    // so both can coexist in the DOM without sharing a popover target).
    const popoverIdDesktop = `np-search-popover-${id ?? "default"}`;
    const popoverIdMobile = `np-search-popover-${id ?? "default"}-m`;

    // Mobile reuses desktop variant — single render, no visibility classes.
    const effectiveMobile: SearchBoxMobileDisplay =
      mobile === "same" ? desktop : mobile;
    if (effectiveMobile === desktop) {
      return renderVariant(desktop, ph, popoverIdDesktop, "");
    }

    // Mobile hidden — only render the desktop variant, hidden below md.
    if (effectiveMobile === "hidden") {
      return renderVariant(desktop, ph, popoverIdDesktop, "hidden md:flex");
    }

    // Different variant on mobile — render both, each gated by a
    // responsive visibility class. (The form helper already uses `flex`
    // for the input variant; `inline-flex` keeps the icon button inline.)
    const desktopHide = desktop === "input" ? "hidden md:flex" : "hidden md:inline-flex";
    const mobileHide = effectiveMobile === "input" ? "flex md:hidden" : "inline-flex md:hidden";
    return (
      <>
        {renderVariant(effectiveMobile as SearchBoxDisplay, ph, popoverIdMobile, mobileHide)}
        {renderVariant(desktop, ph, popoverIdDesktop, desktopHide)}
      </>
    );
  },
};

export const SearchBoxBlock: Omit<RegisteredBlock, "source"> = {
  name: "SearchBox",
  config: SearchBox,
  surfaces: ["header", "sidebar"],
  category: "Template",
};
