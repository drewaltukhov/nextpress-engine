"use client";

import { useEffect } from "react";
import type { NewspaperPost, NewspaperWidgetConfig } from "./types";
import { skeletonForLayout } from "./preloader";
import { toFeaturedThumbVariant } from "@core-plugins/media/storage/url";
import {
  formatDate,
  parseSqliteUtc,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
} from "@core/datetime";

/** Pre-format the date label using the config's dateFormat + timezone.
 *  Mirrors `fmtDate` in cards.tsx so SSR + client output match. */
function fmtDate(publishedAt: string | null, config: NewspaperWidgetConfig): string | null {
  if (!publishedAt) return null;
  return formatDate(
    parseSqliteUtc(publishedAt),
    config.dateFormat ?? DEFAULT_DATE_FORMAT,
    config.timezone ?? DEFAULT_TIMEZONE,
  );
}

/** Author + date byline. Returns null when neither is rendered. Mirrors
 *  the SSR byline structure in cards.tsx (author span, separator dash,
 *  date span). Pass `authorClass` to control author emphasis per card
 *  type (overlay vs. light bodies). */
function buildByline(
  post: NewspaperPost,
  config: NewspaperWidgetConfig,
  opts: { wrapperClass: string; authorClass: string; separatorClass?: string },
): HTMLDivElement | null {
  const showAuthor = config.showAuthor && post.authorName;
  const dateLabel = config.showDate ? fmtDate(post.publishedAt, config) : null;
  if (!showAuthor && !dateLabel) return null;
  const wrap = document.createElement("div");
  wrap.className = opts.wrapperClass;
  if (showAuthor) {
    const span = document.createElement("span");
    span.className = opts.authorClass;
    span.textContent = post.authorName!;
    wrap.appendChild(span);
  }
  if (showAuthor && dateLabel) {
    const sep = document.createElement("span");
    sep.setAttribute("aria-hidden", "true");
    if (opts.separatorClass) sep.className = opts.separatorClass;
    sep.textContent = "-";
    wrap.appendChild(sep);
  }
  if (dateLabel) {
    const span = document.createElement("span");
    span.textContent = dateLabel;
    wrap.appendChild(span);
  }
  return wrap;
}

const BOOTSTRAPPED = Symbol.for("np.newspaper.bootstrapped");

// Minimum visible skeleton time on prev/next/tab swaps. Without this,
// fast fetches (and cached re-clicks) swap content in <50ms and read
// as a jarring "blink" — a visible loading beat smooths the transition.
const MIN_LOADING_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BootstrappedHost extends HTMLElement {
  [BOOTSTRAPPED]?: true;
}

interface HostState {
  config: NewspaperWidgetConfig;
  cache: Map<string, NewspaperPost[]>;
  currentTabKey: string;
  currentOffset: number;
  inFlight: boolean;
  // Whether the most recent fetch returned a full page (used to enable
  // the "next" arrow). Defaults true at SSR so the user can click next
  // at least once before we know for sure.
  lastWasFull: boolean;
}

function parseConfig(host: HTMLElement): NewspaperWidgetConfig | null {
  const raw = host.dataset.npNewspaperConfig;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NewspaperWidgetConfig;
  } catch {
    return null;
  }
}

function buildEndpointUrl(
  config: NewspaperWidgetConfig,
  tabKey: string,
  offset: number,
): string {
  const url = new URL(config.endpoint, window.location.origin);
  const tab = config.tabs.find((t) => t.key === tabKey);
  if (!tab) {
    // Newspaper Hero has no tabs; use all-topics-empty-keys path.
    url.searchParams.set("type", "all");
    url.searchParams.set("allType", "topic");
    url.searchParams.set("scopes", "");
  } else if (tab.scope.type === "all") {
    url.searchParams.set("type", "all");
    // Read the explicit allType discriminator so an empty `scopes`
    // array (the picker's "all checked" sentinel) still encodes the
    // right dimension on the wire.
    url.searchParams.set("allType", tab.scope.allType);
    url.searchParams.set("scopes", tab.scope.scopes.map((s) => s.key).join(","));
  } else {
    url.searchParams.set("type", tab.scope.type);
    url.searchParams.set("scope", tab.scope.key);
  }
  // Request one extra row so the response itself carries the hasMore
  // signal — `response.length > limit` means there's more after this
  // page. Avoids a separate count query and the "click Next → empty
  // page → restore previous" UX glitch when content lands exactly on
  // a limit boundary.
  url.searchParams.set("limit", String(config.limit + 1));
  if (offset > 0) url.searchParams.set("offset", String(offset));
  return url.toString();
}

// ---------------------------------------------------------------------------
// Card / row builders — mirror the JSX in cards.tsx so SSR and client markup match
// ---------------------------------------------------------------------------

function buildSmallCard(
  post: NewspaperPost,
  aspect: "rectangle" | "square",
  config: NewspaperWidgetConfig,
): HTMLAnchorElement {
  if (config.displayStyle === "cards") {
    return buildSmallCardCards(post, aspect, config);
  }
  const a = document.createElement("a");
  a.href = post.url;
  const aspectClass = aspect === "rectangle" ? "aspect-[16/10]" : "aspect-square";
  a.className = `np-newspaper-small-card group relative block overflow-hidden rounded-lg border border-slate-200 ${aspectClass} bg-slate-200`;
  if (post.featuredImage) {
    const img = document.createElement("img");
    img.src = post.featuredImage;
    img.alt = "";
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105";
    a.appendChild(img);
  }
  if (config.overlayClass) {
    const overlay = document.createElement("div");
    overlay.className = `absolute inset-0 ${config.overlayClass}`;
    a.appendChild(overlay);
  }
  const textClass = config.overlayIsDark === false ? "text-brand-navy" : "text-white";
  const inner = document.createElement("div");
  inner.className = `absolute inset-0 flex flex-col justify-end p-4 ${textClass}`;
  if (config.showTopic && post.topic) {
    const chipWrap = document.createElement("div");
    chipWrap.className = "mb-2";
    const chip = document.createElement("span");
    chip.className =
      "inline-flex items-center bg-slate-900/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white";
    chip.style.letterSpacing = "0.05em";
    chip.textContent = post.topic.name;
    chipWrap.appendChild(chip);
    inner.appendChild(chipWrap);
  }
  const h3 = document.createElement("h3");
  h3.className = "text-base font-semibold leading-snug md:text-md";
  h3.textContent = post.title;
  inner.appendChild(h3);
  if (config.showExcerpt && post.excerpt) {
    const bylineClass = config.overlayIsDark === false ? "text-brand-navy/80" : "text-white/80";
    const p = document.createElement("p");
    p.className = `mt-1 line-clamp-2 text-xs ${bylineClass}`;
    p.textContent = post.excerpt;
    inner.appendChild(p);
  }
  const byline = buildByline(post, config, {
    wrapperClass: `mt-2 flex items-center gap-1.5 text-[11px] ${
      config.overlayIsDark === false ? "text-brand-navy/70" : "text-white/70"
    }`,
    authorClass: "font-semibold",
  });
  if (byline) inner.appendChild(byline);
  a.appendChild(inner);
  return a;
}

// Cards-mode small card: plain image on top, title (+ topic chip) in
// a text block underneath. Mirrors the JSX path in `cards.tsx` so
// SSR and mounter-rendered markup stay visually consistent across
// tab/arrow swaps.
function buildSmallCardCards(
  post: NewspaperPost,
  aspect: "rectangle" | "square",
  config: NewspaperWidgetConfig,
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = post.url;
  a.className =
    "np-newspaper-small-card np-newspaper-small-card--cards group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white";
  const imageAspectClass = aspect === "square" ? "aspect-square" : "aspect-[16/10]";
  const imageWrap = document.createElement("div");
  imageWrap.className = `relative ${imageAspectClass} overflow-hidden bg-slate-200`;
  if (post.featuredImage) {
    const img = document.createElement("img");
    img.src = post.featuredImage;
    img.alt = "";
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105";
    imageWrap.appendChild(img);
  }
  a.appendChild(imageWrap);
  const body = document.createElement("div");
  body.className = "flex flex-1 flex-col p-4 text-brand-navy";
  if (config.showTopic && post.topic) {
    const chipWrap = document.createElement("div");
    chipWrap.className = "mb-1";
    const chip = document.createElement("span");
    chip.className =
      "text-[10px] font-semibold uppercase tracking-wide text-brand-green";
    chip.style.letterSpacing = "0.05em";
    chip.textContent = post.topic.name;
    chipWrap.appendChild(chip);
    body.appendChild(chipWrap);
  }
  const h3 = document.createElement("h3");
  h3.className = "text-base font-semibold leading-snug md:text-md";
  h3.textContent = post.title;
  body.appendChild(h3);
  if (config.showExcerpt && post.excerpt) {
    const p = document.createElement("p");
    p.className = "mt-1 line-clamp-2 text-xs text-slate-500";
    p.textContent = post.excerpt;
    body.appendChild(p);
  }
  const byline = buildByline(post, config, {
    wrapperClass: "mt-2 flex items-center gap-1.5 text-[11px] text-slate-500",
    authorClass: "text-slate-700",
  });
  if (byline) body.appendChild(byline);
  a.appendChild(body);
  return a;
}

function buildFeaturedCard(
  post: NewspaperPost,
  size: "large" | "medium",
  config: NewspaperWidgetConfig,
): HTMLAnchorElement {
  if (config.displayStyle === "cards") {
    return buildFeaturedCardCards(post, size, config);
  }
  const a = document.createElement("a");
  a.href = post.url;
  a.className =
    "np-newspaper-featured-card group relative block overflow-hidden rounded-lg border border-slate-200 aspect-[16/10] bg-slate-200";
  if (post.featuredImage) {
    const img = document.createElement("img");
    img.src = post.featuredImage;
    img.alt = "";
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105";
    a.appendChild(img);
  }
  if (config.overlayClass) {
    const overlay = document.createElement("div");
    overlay.className = `absolute inset-0 ${config.overlayClass}`;
    a.appendChild(overlay);
  }
  const textClass = config.overlayIsDark === false ? "text-brand-navy" : "text-white";
  const inner = document.createElement("div");
  inner.className = `absolute inset-0 flex flex-col justify-end p-5 md:p-6 ${textClass}`;
  if (config.showTopic && post.topic) {
    const chipWrap = document.createElement("div");
    chipWrap.className = "mb-3";
    const chip = document.createElement("span");
    chip.className =
      "inline-flex items-center bg-slate-900/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white";
    chip.style.letterSpacing = "0.05em";
    chip.textContent = post.topic.name;
    chipWrap.appendChild(chip);
    inner.appendChild(chipWrap);
  }
  const h2 = document.createElement("h2");
  h2.className =
    size === "large"
      ? "text-xl md:text-2xl font-bold leading-tight"
      : "text-md md:text-xl font-semibold leading-tight";
  h2.textContent = post.title;
  inner.appendChild(h2);
  if (config.showExcerpt && post.excerpt) {
    const p = document.createElement("p");
    p.className = "mt-1 line-clamp-2 text-sm";
    p.textContent = post.excerpt;
    inner.appendChild(p);
  }
  const byline = buildByline(post, config, {
    wrapperClass: `mt-2 flex items-center gap-1.5 text-xs ${
      config.overlayIsDark === false ? "text-brand-navy/70" : "text-white/70"
    }`,
    authorClass: "font-semibold",
  });
  if (byline) inner.appendChild(byline);
  a.appendChild(inner);
  return a;
}

// Cards-mode featured card mirror of the JSX path.
function buildFeaturedCardCards(
  post: NewspaperPost,
  size: "large" | "medium",
  config: NewspaperWidgetConfig,
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = post.url;
  a.className =
    "np-newspaper-featured-card np-newspaper-featured-card--cards group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white";
  const imageWrap = document.createElement("div");
  imageWrap.className = "relative aspect-[16/10] overflow-hidden bg-slate-200";
  if (post.featuredImage) {
    const img = document.createElement("img");
    img.src = post.featuredImage;
    img.alt = "";
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105";
    imageWrap.appendChild(img);
  }
  a.appendChild(imageWrap);
  const body = document.createElement("div");
  body.className = "flex flex-1 flex-col p-5 md:p-6 text-brand-navy";
  if (config.showTopic && post.topic) {
    const chipWrap = document.createElement("div");
    chipWrap.className = "mb-2";
    const chip = document.createElement("span");
    chip.className =
      "text-[10px] font-semibold uppercase tracking-wide text-brand-green";
    chip.style.letterSpacing = "0.05em";
    chip.textContent = post.topic.name;
    chipWrap.appendChild(chip);
    body.appendChild(chipWrap);
  }
  const h2 = document.createElement("h2");
  h2.className =
    size === "large"
      ? "text-xl md:text-2xl font-bold leading-tight"
      : "text-md md:text-xl font-semibold leading-tight";
  h2.textContent = post.title;
  body.appendChild(h2);
  if (config.showExcerpt && post.excerpt) {
    const p = document.createElement("p");
    p.className = "mt-2 line-clamp-2 text-sm text-slate-600";
    p.textContent = post.excerpt;
    body.appendChild(p);
  }
  const byline = buildByline(post, config, {
    wrapperClass: "mt-2 flex items-center gap-1.5 text-xs text-slate-500",
    authorClass: "text-slate-700",
  });
  if (byline) body.appendChild(byline);
  a.appendChild(body);
  return a;
}

function buildListRow(
  post: NewspaperPost,
  config: NewspaperWidgetConfig,
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = post.url;
  a.className =
    "np-newspaper-list-row group flex items-start gap-2 rounded-md p-2 transition hover:bg-slate-50";

  const thumb = document.createElement("div");
  thumb.className = "size-15 shrink-0 overflow-hidden rounded bg-slate-100";
  if (post.featuredImage) {
    const img = document.createElement("img");
    img.src = toFeaturedThumbVariant(post.featuredImage) ?? post.featuredImage;
    img.alt = "";
    img.className =
      "h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105";
    img.loading = "lazy";
    thumb.appendChild(img);
  }
  a.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "min-w-0 flex-1";
  if (config.showTopic && post.topic) {
    const chip = document.createElement("div");
    chip.className =
      "mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500";
    chip.textContent = post.topic.name;
    body.appendChild(chip);
  }
  const h3 = document.createElement("h3");
  h3.className =
    "text-base font-semibold leading-snug text-slate-900 group-hover:text-brand-green";
  h3.textContent = post.title;
  body.appendChild(h3);
  if (config.showExcerpt && post.excerpt) {
    const p = document.createElement("p");
    p.className = "mt-1 line-clamp-2 text-xs text-slate-500";
    p.textContent = post.excerpt;
    body.appendChild(p);
  }
  const byline = buildByline(post, config, {
    wrapperClass: "mt-1 flex items-center gap-1.5 text-[11px] text-slate-500",
    authorClass: "text-slate-700 font-medium",
  });
  if (byline) body.appendChild(byline);
  a.appendChild(body);
  return a;
}

// ---------------------------------------------------------------------------
// Layout renderers
// ---------------------------------------------------------------------------

function renderSectionLayout(
  contentEl: HTMLElement,
  posts: NewspaperPost[],
  config: NewspaperWidgetConfig,
): void {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-2 md:grid-cols-3";
  for (const post of posts) {
    grid.appendChild(buildSmallCard(post, "rectangle", config));
  }
  contentEl.replaceChildren(grid);
}

function renderSectionHeroLayout(
  contentEl: HTMLElement,
  posts: NewspaperPost[],
  config: NewspaperWidgetConfig,
): void {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 gap-2 md:grid-cols-2";
  const [featured, ...rows] = posts;
  if (featured) grid.appendChild(buildFeaturedCard(featured, "large", config));
  const col = document.createElement("div");
  col.className = "flex flex-col gap-2";
  for (const p of rows) col.appendChild(buildListRow(p, config));
  grid.appendChild(col);
  contentEl.replaceChildren(grid);
}

function renderSectionFeaturedLayout(
  contentEl: HTMLElement,
  posts: NewspaperPost[],
  config: NewspaperWidgetConfig,
): void {
  const wrap = document.createElement("div");
  wrap.className = "space-y-4";

  const featured = document.createElement("div");
  featured.className = "grid grid-cols-1 gap-2 md:grid-cols-2";
  const featuredPosts = posts.slice(0, 2);
  featuredPosts.forEach((p, i) => {
    featured.appendChild(buildFeaturedCard(p, i === 0 ? "large" : "medium", config));
  });
  wrap.appendChild(featured);

  const rest = posts.slice(2);
  if (rest.length > 0) {
    const rows = document.createElement("div");
    rows.className = "grid grid-cols-1 gap-2 md:grid-cols-2";
    for (const p of rest) rows.appendChild(buildListRow(p, config));
    wrap.appendChild(rows);
  }
  contentEl.replaceChildren(wrap);
}

function renderListIntoContent(
  contentEl: HTMLElement,
  posts: NewspaperPost[],
  config: NewspaperWidgetConfig,
): void {
  switch (config.layout) {
    case "section":
      renderSectionLayout(contentEl, posts, config);
      return;
    case "section-hero":
      renderSectionHeroLayout(contentEl, posts, config);
      return;
    case "section-featured":
      renderSectionFeaturedLayout(contentEl, posts, config);
      return;
    case "hero":
      // Newspaper Hero has no client-side interactivity; no-op.
      return;
  }
}

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

function setActiveTab(host: HTMLElement, state: HostState, key: string): void {
  state.currentTabKey = key;
  state.currentOffset = 0;
  const tabButtons = host.querySelectorAll<HTMLButtonElement>(
    `[data-np-newspaper-tab="${state.config.widgetId}"]`,
  );
  for (const btn of Array.from(tabButtons)) {
    const active = btn.dataset.npNewspaperTabKey === key;
    btn.setAttribute("aria-selected", String(active));
    btn.tabIndex = active ? 0 : -1;
    btn.classList.toggle("np-newspaper-section-tab--active", active);
    btn.classList.toggle("font-semibold", active);
    btn.classList.toggle("text-slate-900", active);
    btn.classList.toggle("text-slate-500", !active);
  }

  // Keep the brand label pill in sync with the active tab so the widget
  // title reflects the user's current selection (not just the SSR default).
  const label = host.querySelector<HTMLElement>(
    `[data-np-newspaper-label="${state.config.widgetId}"]`,
  );
  if (label) {
    const tab = state.config.tabs.find((t) => t.key === key);
    if (tab) label.textContent = tab.label;
  }
}

// ---------------------------------------------------------------------------
// Arrow state
// ---------------------------------------------------------------------------

function updateArrowsDisabled(state: HostState, host: HTMLElement): void {
  const prev = host.querySelector<HTMLButtonElement>("[data-np-newspaper-prev]");
  const next = host.querySelector<HTMLButtonElement>("[data-np-newspaper-next]");
  if (prev) prev.disabled = state.currentOffset <= 0 || state.inFlight;
  if (next) next.disabled = state.inFlight || !state.lastWasFull;
}

// ---------------------------------------------------------------------------
// Fetch + render
// ---------------------------------------------------------------------------

async function fetchAndRender(
  host: HTMLElement,
  state: HostState,
  tabKey: string,
  offset: number,
): Promise<void> {
  const contentEl = host.querySelector<HTMLElement>("[data-np-newspaper-content]");
  if (!contentEl) return;
  const cacheKey = offset > 0 ? `${tabKey}:offset=${offset}` : tabKey;

  // Past-the-end no-op: nothing to render or skeleton, just lock Next.
  // Detected via a cached empty page at offset > 0.
  const cached = state.cache.get(cacheKey);
  if (cached && cached.length === 0 && offset > 0) {
    state.lastWasFull = false;
    updateArrowsDisabled(state, host);
    return;
  }

  // Every other path goes through the skeleton + min-loading flow so
  // the transition reads as a deliberate beat, not a flicker.
  const startedAt = Date.now();
  state.inFlight = true;
  updateArrowsDisabled(state, host);
  contentEl.setAttribute("aria-busy", "true");
  contentEl.replaceChildren(skeletonForLayout(state.config.layout, state.config));

  try {
    // `raw` is the un-sliced fetch (or cached) response — up to limit+1
    // rows. `posts` is what we actually render. The extra row, if
    // present, is purely the hasMore signal.
    let raw: NewspaperPost[];
    if (cached) {
      raw = cached;
    } else {
      const url = buildEndpointUrl(state.config, tabKey, offset);
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { posts: NewspaperPost[] };
      state.cache.set(cacheKey, body.posts);
      raw = body.posts;
    }
    const posts = raw.slice(0, state.config.limit);

    // Empty forward page → end of the list. Don't render the empty
    // grid; keep the previous page visible and lock Next off. The
    // empty result is cached so a re-click is also a no-op.
    if (posts.length === 0 && offset > 0) {
      state.lastWasFull = false;
      const prevCacheKey =
        state.currentOffset > 0
          ? `${state.currentTabKey}:offset=${state.currentOffset}`
          : state.currentTabKey;
      const prevRaw = state.cache.get(prevCacheKey);
      if (prevRaw) {
        const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
        if (remaining > 0) await delay(remaining);
        renderListIntoContent(contentEl, prevRaw.slice(0, state.config.limit), state.config);
      }
      return;
    }

    state.currentTabKey = tabKey;
    state.currentOffset = offset;
    // Extra row in `raw` means there's at least one more page after
    // this one. If the response came back ≤ limit, we know we're on
    // the last page.
    state.lastWasFull = raw.length > state.config.limit;

    const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining > 0) await delay(remaining);

    renderListIntoContent(contentEl, posts, state.config);
  } catch {
    const err = document.createElement("div");
    err.setAttribute("role", "status");
    err.className = "p-4 text-sm text-slate-500";
    err.textContent = "Couldn't load this section. ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "text-brand-green underline";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      void fetchAndRender(host, state, tabKey, offset);
    });
    err.appendChild(retry);
    contentEl.replaceChildren(err);
  } finally {
    state.inFlight = false;
    contentEl.removeAttribute("aria-busy");
    updateArrowsDisabled(state, host);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function bootstrap(host: BootstrappedHost): (() => void) | null {
  if (host[BOOTSTRAPPED]) return null;
  host[BOOTSTRAPPED] = true;
  const config = parseConfig(host);
  if (!config) return null;

  const state: HostState = {
    config,
    cache: new Map(),
    currentTabKey: config.initialTabKey,
    currentOffset: 0,
    inFlight: false,
    lastWasFull: true,
  };

  // Seed lastWasFull from the SSR-computed hint when present. Falls
  // back to the old "did the initial DOM contain at least `limit`
  // items" heuristic for configs saved before initialHasMore shipped.
  if (typeof config.initialHasMore === "boolean") {
    state.lastWasFull = config.initialHasMore;
  } else {
    const initialPosts = host.querySelectorAll(
      "[data-np-newspaper-content] a",
    ).length;
    state.lastWasFull = initialPosts >= config.limit;
  }

  const prev = host.querySelector<HTMLButtonElement>("[data-np-newspaper-prev]");
  const next = host.querySelector<HTMLButtonElement>("[data-np-newspaper-next]");
  updateArrowsDisabled(state, host);

  const handlers: Array<() => void> = [];
  if (prev) {
    const fn = () =>
      void fetchAndRender(
        host,
        state,
        state.currentTabKey,
        Math.max(0, state.currentOffset - state.config.limit),
      );
    prev.addEventListener("click", fn);
    handlers.push(() => prev.removeEventListener("click", fn));
  }
  if (next) {
    const fn = () =>
      void fetchAndRender(
        host,
        state,
        state.currentTabKey,
        state.currentOffset + state.config.limit,
      );
    next.addEventListener("click", fn);
    handlers.push(() => next.removeEventListener("click", fn));
  }

  // Tab click handlers
  const tabButtons = Array.from(
    host.querySelectorAll<HTMLButtonElement>(
      `[data-np-newspaper-tab="${config.widgetId}"]`,
    ),
  );
  for (const btn of tabButtons) {
    const fn = () => {
      const key = btn.dataset.npNewspaperTabKey;
      if (!key || key === state.currentTabKey) return;
      setActiveTab(host, state, key);
      void fetchAndRender(host, state, key, 0);
    };
    btn.addEventListener("click", fn);
    handlers.push(() => btn.removeEventListener("click", fn));
  }

  // Keyboard navigation on tab strip (ARIA tabs: ArrowLeft/ArrowRight)
  const tablist = host.querySelector<HTMLElement>(
    `[data-np-newspaper-tablist="${config.widgetId}"]`,
  );
  if (tablist) {
    const keyFn = (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      ev.preventDefault();
      const active = tabButtons.findIndex(
        (b) => b.getAttribute("aria-selected") === "true",
      );
      const delta = ev.key === "ArrowRight" ? 1 : -1;
      const nextIdx = (active + delta + tabButtons.length) % tabButtons.length;
      tabButtons[nextIdx]?.focus();
      tabButtons[nextIdx]?.click();
    };
    tablist.addEventListener("keydown", keyFn);
    handlers.push(() => tablist.removeEventListener("keydown", keyFn));
  }

  return () => {
    for (const h of handlers) h();
    delete host[BOOTSTRAPPED];
  };
}

// ---------------------------------------------------------------------------
// React mount point
// ---------------------------------------------------------------------------

export function NewspaperWidgetsMounter(): null {
  useEffect(() => {
    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>("[data-np-newspaper-widget]"),
    );
    if (hosts.length === 0) return;
    const teardown: Array<() => void> = [];
    for (const host of hosts) {
      const c = bootstrap(host);
      if (c) teardown.push(c);
    }
    return () => {
      for (const fn of teardown) fn();
    };
  }, []);
  return null;
}
