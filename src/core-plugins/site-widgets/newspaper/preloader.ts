/**
 * Imperative-DOM skeletons drawn during a fetch. Each function returns
 * a DocumentFragment the mounter slots into the host's content area.
 *
 * Skeletons mirror the rendered card structure — overlay cards stay
 * fixed-aspect (text overlays the image), but cards-mode tiles and
 * list rows grow with the post-meta toggles (showExcerpt adds a
 * 2-line block, showDate/showAuthor add a 1-line byline) so the layout
 * doesn't jump when the real content lands.
 *
 * Lives outside the mounter file to keep that file focused on event
 * wiring; can also be tested independently with jsdom if we ever need.
 */

import type { NewspaperWidgetConfig } from "./types";

/** Per-row toggles that influence skeleton height. */
interface MetaShape {
  showExcerpt: boolean;
  showDate: boolean;
  showAuthor: boolean;
  /** Cards mode adds a text body below the image; overlay mode keeps
   *  text inside the image so the card height stays fixed. */
  cardsMode: boolean;
}

function metaShape(config?: NewspaperWidgetConfig): MetaShape {
  return {
    showExcerpt: Boolean(config?.showExcerpt),
    showDate: Boolean(config?.showDate),
    showAuthor: Boolean(config?.showAuthor),
    cardsMode: config?.displayStyle === "cards",
  };
}

function pulse(className: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `${className} animate-pulse bg-slate-100`;
  return el;
}

function spinnerOverlay(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className =
    "pointer-events-none absolute inset-0 z-10 flex items-center justify-center";
  wrap.setAttribute("aria-hidden", "true");
  const spinner = document.createElement("div");
  spinner.className =
    "size-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-green";
  wrap.appendChild(spinner);
  return wrap;
}

/** Title + (optional) excerpt + (optional) byline placeholder. Matches
 *  the body-section structure rendered by `buildListRow` and the
 *  cards-mode card body. */
function bodyLines(meta: MetaShape): HTMLDivElement {
  const lines = document.createElement("div");
  lines.className = "flex-1 space-y-2";
  // Title — two lines so headlines that wrap (the common case) don't
  // visibly grow the row on render.
  lines.appendChild(pulse("h-4 w-full rounded"));
  lines.appendChild(pulse("h-4 w-2/3 rounded"));
  if (meta.showExcerpt) {
    const excerpt = document.createElement("div");
    excerpt.className = "pt-1 space-y-1.5";
    excerpt.appendChild(pulse("h-3 w-full rounded"));
    excerpt.appendChild(pulse("h-3 w-3/4 rounded"));
    lines.appendChild(excerpt);
  }
  if (meta.showAuthor || meta.showDate) {
    lines.appendChild(pulse("mt-1 h-3 w-2/5 rounded"));
  }
  return lines;
}

/** A list-row placeholder: small square thumb + body lines. Used by
 *  section-hero (right column) and section-featured (bottom rows). */
function listRowPlaceholder(meta: MetaShape): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "flex gap-2";
  row.appendChild(pulse("size-15 shrink-0 rounded"));
  row.appendChild(bodyLines(meta));
  return row;
}

/** A cards-mode tile: image-on-top + body. Body grows with toggles so
 *  the tile height matches the rendered output. */
function cardsModeTilePlaceholder(
  imageAspect: string,
  meta: MetaShape,
): HTMLDivElement {
  const card = document.createElement("div");
  card.className =
    "flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white";
  card.appendChild(pulse(`${imageAspect} w-full rounded-none`));
  const body = document.createElement("div");
  body.className = "p-4 space-y-2";
  body.appendChild(bodyLines(meta));
  card.appendChild(body);
  return card;
}

export function heroSkeleton(config?: NewspaperWidgetConfig): DocumentFragment {
  const meta = metaShape(config);
  const f = document.createDocumentFragment();
  const grid = document.createElement("div");
  grid.className = "relative grid grid-cols-1 gap-2 md:grid-cols-2";
  if (meta.cardsMode) {
    grid.appendChild(cardsModeTilePlaceholder("aspect-[16/10] md:row-span-2", meta));
    const right = document.createElement("div");
    right.className = "grid grid-cols-2 gap-2";
    for (let i = 0; i < 4; i++) {
      right.appendChild(cardsModeTilePlaceholder("aspect-[16/10]", meta));
    }
    grid.appendChild(right);
  } else {
    // Overlay mode: each tile's height is locked to its image aspect.
    // No body-height growth from toggles since text overlays the image.
    grid.appendChild(pulse("aspect-[4/3] md:row-span-2 rounded-lg border border-slate-200"));
    const right = document.createElement("div");
    right.className = "grid grid-cols-2 gap-2";
    for (let i = 0; i < 4; i++) {
      right.appendChild(pulse("aspect-[16/10] rounded-lg border border-slate-200"));
    }
    grid.appendChild(right);
  }
  grid.appendChild(spinnerOverlay());
  f.appendChild(grid);
  return f;
}

export function sectionHeroSkeleton(
  config?: NewspaperWidgetConfig,
): DocumentFragment {
  const meta = metaShape(config);
  const f = document.createDocumentFragment();
  const grid = document.createElement("div");
  grid.className = "relative grid grid-cols-1 gap-2 md:grid-cols-2";
  // Featured card: overlay or cards mode — but the featured cell is
  // always image-driven (text overlays in overlay mode, large card in
  // cards mode). For simplicity keep the aspect-locked block; the
  // height-jump risk is only on the list rows on the right.
  if (meta.cardsMode) {
    grid.appendChild(cardsModeTilePlaceholder("aspect-[16/10]", meta));
  } else {
    grid.appendChild(pulse("aspect-[16/10] rounded-lg border border-slate-200"));
  }
  const right = document.createElement("div");
  right.className = "flex flex-col gap-2";
  for (let i = 0; i < 4; i++) right.appendChild(listRowPlaceholder(meta));
  grid.appendChild(right);
  grid.appendChild(spinnerOverlay());
  f.appendChild(grid);
  return f;
}

export function sectionSkeleton(
  config?: NewspaperWidgetConfig,
): DocumentFragment {
  const meta = metaShape(config);
  const f = document.createDocumentFragment();
  const grid = document.createElement("div");
  grid.className = "relative grid grid-cols-1 gap-2 md:grid-cols-3";
  for (let i = 0; i < 3; i++) {
    if (meta.cardsMode) {
      grid.appendChild(cardsModeTilePlaceholder("aspect-[16/10]", meta));
    } else {
      // Overlay tile — fixed aspect. Text overlays the image so toggles
      // don't change the rendered height.
      grid.appendChild(pulse("aspect-[16/10] rounded-lg border border-slate-200"));
    }
  }
  grid.appendChild(spinnerOverlay());
  f.appendChild(grid);
  return f;
}

export function sectionFeaturedSkeleton(
  config?: NewspaperWidgetConfig,
): DocumentFragment {
  const meta = metaShape(config);
  const f = document.createDocumentFragment();
  const wrap = document.createElement("div");
  wrap.className = "relative space-y-4";
  const featured = document.createElement("div");
  featured.className = "grid grid-cols-1 gap-2 md:grid-cols-2";
  for (let i = 0; i < 2; i++) {
    if (meta.cardsMode) {
      featured.appendChild(cardsModeTilePlaceholder("aspect-[16/10]", meta));
    } else {
      featured.appendChild(pulse("aspect-[16/10] rounded-lg border border-slate-200"));
    }
  }
  wrap.appendChild(featured);
  const rows = document.createElement("div");
  rows.className = "grid grid-cols-1 gap-2 md:grid-cols-2";
  for (let i = 0; i < 4; i++) rows.appendChild(listRowPlaceholder(meta));
  wrap.appendChild(rows);
  wrap.appendChild(spinnerOverlay());
  f.appendChild(wrap);
  return f;
}

export function skeletonForLayout(
  layout: "hero" | "section-hero" | "section" | "section-featured",
  config?: NewspaperWidgetConfig,
): DocumentFragment {
  switch (layout) {
    case "hero":
      return heroSkeleton(config);
    case "section-hero":
      return sectionHeroSkeleton(config);
    case "section":
      return sectionSkeleton(config);
    case "section-featured":
      return sectionFeaturedSkeleton(config);
  }
}
