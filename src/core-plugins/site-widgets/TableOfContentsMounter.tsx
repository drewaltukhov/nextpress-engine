"use client";

import { useEffect } from "react";

/**
 * Page-level bootstrapper for every Table of Contents widget on a
 * public route.
 *
 * Why this lives outside Puck's tree:
 *   The TOC widget needs to read the rendered DOM (heading scrape)
 *   plus react to scroll, which means hooks. Mounting a hooks-using
 *   component through Puck's RSC `<Render>` proved unreliable — the
 *   "use client" boundary doesn't survive Puck's `jsx(Component.render,
 *   props)` path consistently and the inner widget ends up being
 *   invoked with a null React dispatcher.
 *
 *   Instead, the `TableOfContents` block emits a static placeholder
 *   div carrying its config as `data-toc-*` attributes. This
 *   bootstrapper, mounted once per route from the page file
 *   (alongside `DisableRightClick`), scans for those placeholders
 *   and builds each TOC via direct DOM manipulation — no React
 *   render tree to entangle with Puck's pipeline.
 *
 * Behavior matches the previous React widget:
 *   - Scrape h2/h3/h4 from the configured scope element (default
 *     `.np-post-content, .np-page-content` — limits the scrape to
 *     the post/page body so widget-emitted headings elsewhere in
 *     the template don't pollute the list), respecting the per-level
 *     toggles. Saved widgets still carrying the legacy `.np-main`
 *     selector are silently upgraded to the new default below.
 *   - Slugify and assign IDs to headings missing one (with
 *     disambiguation when the same text repeats)
 *   - Render an OL with decimal markers and per-level indentation
 *   - Anchor click smooth-scrolls to the heading with the configured
 *     top offset; URL hash is updated without triggering the native
 *     jump
 *   - IntersectionObserver tracks the section currently in view and
 *     highlights the matching link
 *   - When the scope yields zero qualifying headings, the
 *     placeholder is hidden entirely so empty sidebars don't show
 *     vacant chrome
 */

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Default scope for the TableOfContents widget. Narrowed to the
 * post/page body so headings emitted by other widgets in the template
 * column (HeroTitle, an author-dropped Heading widget, etc.) never
 * appear in the generated list.
 */
const DEFAULT_TOC_SCOPE = ".np-post-content, .np-page-content";

/**
 * `.np-main` was the historical default and is the entire main column
 * — way too broad now that templates can contain their own headings.
 * Translate it to the narrower default so widget instances saved
 * before this change get the fix automatically; bespoke selectors
 * (anything else) are left alone.
 */
function normalizeScope(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === ".np-main") return DEFAULT_TOC_SCOPE;
  return v;
}

const INDENT_BY_LEVEL: Record<2 | 3 | 4, string> = {
  2: "",
  3: "ml-4",
  4: "ml-8",
};

interface TocConfig {
  title: string;
  scopeSelector: string;
  showH2: boolean;
  showH3: boolean;
  showH4: boolean;
  scrollOffsetPx: number;
  smoothScroll: boolean;
}

function readConfig(el: HTMLElement): TocConfig {
  return {
    title: el.dataset.tocTitle ?? "",
    scopeSelector: normalizeScope(el.dataset.tocScope),
    showH2: el.dataset.tocH2 === "1",
    showH3: el.dataset.tocH3 === "1",
    showH4: el.dataset.tocH4 === "1",
    scrollOffsetPx: Number.parseInt(el.dataset.tocOffset ?? "80", 10) || 80,
    smoothScroll: el.dataset.tocSmooth === "1",
  };
}

function buildItems(scope: Element, cfg: TocConfig): TocItem[] {
  const tags: string[] = [];
  if (cfg.showH2) tags.push("h2");
  if (cfg.showH3) tags.push("h3");
  if (cfg.showH4) tags.push("h4");
  if (tags.length === 0) return [];
  const headings = Array.from(
    scope.querySelectorAll<HTMLElement>(tags.join(",")),
  );
  const seen = new Set<string>();
  const out: TocItem[] = [];
  for (const node of headings) {
    // Widgets that render their own H-tags (Recent Posts title etc.)
    // shouldn't pollute the post's TOC. Any ancestor carrying
    // `[data-np-toc-skip]` opts the whole subtree out of scraping.
    if (node.closest("[data-np-toc-skip]")) continue;
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    let id = node.id;
    if (!id) {
      const base = slugify(text) || "section";
      let candidate = base;
      let n = 2;
      while (seen.has(candidate)) candidate = `${base}-${n++}`;
      id = candidate;
      node.id = id;
    }
    seen.add(id);
    const level = Number(node.tagName.slice(1)) as 2 | 3 | 4;
    out.push({ id, text, level });
  }
  return out;
}

function renderInto(host: HTMLElement, items: TocItem[], cfg: TocConfig): {
  links: HTMLAnchorElement[];
} {
  // Reset host and emit chrome.
  host.innerHTML = "";
  const nav = document.createElement("nav");
  nav.className =
    "not-prose mb-4 rounded-lg border border-slate-200 bg-white p-4";
  nav.setAttribute("aria-label", "Table of contents");
  // The title is an <h3> — match Recent Posts' chrome. Opt this whole
  // subtree out of scraping so the TOC's own title doesn't get pulled
  // into the list when the widget is placed inside `.np-main` itself.
  nav.setAttribute("data-np-toc-skip", "");

  if (cfg.title) {
    // Match the Recent Posts (PostsGrid) widget's title — same element
    // and same Tailwind classes — so sidebar widgets share a single
    // visual treatment for their group label.
    const titleEl = document.createElement("h3");
    titleEl.className = "mb-3 text-sm font-semibold text-brand-navy";
    titleEl.textContent = cfg.title;
    nav.appendChild(titleEl);
  }

  const ol = document.createElement("ol");
  ol.className =
    "m-0 list-decimal space-y-1 pl-6 text-sm marker:text-slate-400";

  const links: HTMLAnchorElement[] = [];
  for (const item of items) {
    const li = document.createElement("li");
    if (INDENT_BY_LEVEL[item.level]) li.className = INDENT_BY_LEVEL[item.level];
    const a = document.createElement("a");
    a.href = `#${item.id}`;
    a.dataset.tocLinkId = item.id;
    a.className = "block py-0.5 text-slate-600 transition-colors hover:text-brand-green";
    a.textContent = item.text;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(item.id);
      if (!target) return;
      const top =
        target.getBoundingClientRect().top + window.scrollY - cfg.scrollOffsetPx;
      window.scrollTo({
        top,
        behavior: cfg.smoothScroll ? "smooth" : "auto",
      });
      history.replaceState(null, "", `#${item.id}`);
      setActive(links, item.id);
    });
    li.appendChild(a);
    ol.appendChild(li);
    links.push(a);
  }

  nav.appendChild(ol);
  host.appendChild(nav);
  return { links };
}

function setActive(links: HTMLAnchorElement[], activeId: string | null): void {
  for (const a of links) {
    const isActive = a.dataset.tocLinkId === activeId;
    if (isActive) {
      a.className =
        "block py-0.5 transition-colors font-semibold text-brand-green";
    } else {
      a.className =
        "block py-0.5 transition-colors text-slate-600 hover:text-brand-green";
    }
  }
}

function bootstrap(host: HTMLElement): (() => void) | null {
  const cfg = readConfig(host);
  const scope = document.querySelector(cfg.scopeSelector);
  if (!scope) {
    host.style.display = "none";
    return null;
  }
  const items = buildItems(scope, cfg);
  if (items.length === 0) {
    host.style.display = "none";
    return null;
  }
  host.style.display = "";
  const { links } = renderInto(host, items, cfg);

  // Scroll-spy: highlight the heading currently in the upper portion
  // of the viewport. The rootMargin (top = -offset, bottom = -55%)
  // intentionally reserves a band rather than tracking single-pixel
  // crossings so the active link doesn't flicker on minor scrolls.
  const elements = items
    .map((it) => document.getElementById(it.id))
    .filter((el): el is HTMLElement => el !== null);
  let cleanup: (() => void) | null = null;
  if (elements.length > 0) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(links, visible[0].target.id);
      },
      {
        rootMargin: `-${Math.max(0, cfg.scrollOffsetPx)}px 0px -55% 0px`,
        threshold: 0,
      },
    );
    for (const el of elements) io.observe(el);
    cleanup = () => io.disconnect();
  }
  return cleanup;
}

export function TableOfContentsMounter(): null {
  useEffect(() => {
    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>("[data-np-toc]"),
    );
    if (hosts.length === 0) return;
    const teardown: Array<() => void> = [];
    for (const host of hosts) {
      const cleanup = bootstrap(host);
      if (cleanup) teardown.push(cleanup);
    }
    return () => {
      for (const fn of teardown) fn();
    };
  }, []);
  return null;
}
