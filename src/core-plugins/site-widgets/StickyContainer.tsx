import type { ComponentConfig } from "@measured/puck";
import { getBlocksForSurface, type RegisteredBlock } from "@core/blocks/registry";

// Pull the DropZone from `puck.renderDropZone` rather than importing
// `DropZone` from `@measured/puck` directly. Puck's RSC entry
// (resolved by the `react-server` export condition) doesn't ship the
// editor's DropZone — it ships an internal `DropZoneRender` and
// exposes it through the PuckContext on every block render.
// Going through the context keeps the same block file usable in both
// the public render (server) and the builder (client).

/**
 * Sticky drop-zone widget. Anything dropped inside it pins to the top
 * of the viewport on scroll, and the whole group stays together (no
 * stacking math needed) because there is one sticky element with
 * everything else flowing inside it.
 *
 * Sidebar layout note: in the public render the container's parent is
 * the `<aside>` grid item, which stretches to match the height of the
 * main column. CSS sticky's pin range is bounded by that parent, so
 * the contents stay sticky for the full main-column scroll — which is
 * the user-visible "stays sticky as long as main does" behavior.
 *
 * Use `topOffsetRem` to clear a sticky header — the renderer does not
 * measure header height, so this is the manual knob. Default 0.
 */
export type StickyPinStart = "immediate" | "deferred";

export interface StickyContainerProps {
  /** Pixel offset from the viewport top, expressed in rem. Set to your
   *  sticky header's height when you have one. 0 means flush to the
   *  top edge. */
  topOffsetRem: number;
  /** Vertical gap between dropped widgets, in rem. Plain margin between
   *  the container's children — doesn't affect the sticky behavior. */
  gapRem: number;
  /** When to engage the pin:
   *   - `"immediate"` (default) — standard CSS sticky behavior: pins
   *     as soon as the container's top would cross the offset line.
   *   - `"deferred"` — the container scrolls with the page until every
   *     OTHER widget in the same sidebar has scrolled fully past the
   *     offset line. Only then does it pin. Useful for "let the rest
   *     of the sidebar read first, then stick to the top" layouts. The
   *     handoff is implemented by toggling the sticky offset via an
   *     inline scroll-watcher (the same script that drives `is-sticky`)
   *     so we don't need a `"use client"` component. */
  pinStart: StickyPinStart;
  /** Auto-injected by Puck — every block has a stable string id. We
   *  use it as the DOM id so the inline scroll-watcher script can
   *  toggle `is-sticky` on the matching element. */
  id?: string;
}

export const StickyContainer: ComponentConfig<StickyContainerProps> = {
  label: "Sticky Container",
  fields: {
    topOffsetRem: {
      type: "number",
      label: "Top offset (rem)",
      min: 0,
      max: 12,
      step: 0.25,
    },
    gapRem: {
      type: "number",
      label: "Gap between items (rem)",
      min: 0,
      max: 4,
      step: 0.25,
    },
    pinStart: {
      type: "radio",
      label: "When to pin",
      options: [
        { label: "Immediately when reached", value: "immediate" },
        { label: "After other sidebar widgets scroll past", value: "deferred" },
      ],
    },
  },
  defaultProps: {
    topOffsetRem: 0,
    gapRem: 1,
    pinStart: "immediate",
  },
  render: ({ topOffsetRem, gapRem, pinStart, id, puck }) => {
    const offsetPx = Math.max(0, Math.round((topOffsetRem ?? 0) * 16));
    const stickyId = `np-sticky-${id ?? "anon"}`;
    const resolvedPinStart: StickyPinStart = pinStart ?? "immediate";
    const deferred = resolvedPinStart === "deferred";
    // Render the same `top` value on both sides of hydration. In
    // deferred mode the inline watcher (below) immediately overrides
    // this to control pin engagement; doing the override in JS rather
    // than in JSX keeps the server-rendered HTML and the first
    // client-render byte-for-byte identical so React's hydrator stays
    // quiet (otherwise React patches the DOM post-hydration and the
    // patch itself reads as the visible "jump" the user is reporting).
    // The script ships as the immediate next sibling in HTML, so it
    // executes during parse — before paint — and the transitional
    // state never reaches the screen.
    const wrapperStyle: React.CSSProperties = {
      top: `${topOffsetRem ?? 0}rem`,
    };
    const innerStyle: React.CSSProperties = {
      rowGap: `${gapRem ?? 1}rem`,
    };

    const DropZone = puck?.renderDropZone;
    // Inner DropZone accepts the same set of widgets the outer sidebar
    // zone does (`getBlocksForSurface("sidebar")`), minus StickyContainer
    // itself — recursive sticky doesn't add anything but pain. Computed
    // at render time so newly-registered sidebar widgets become
    // droppable inside without touching this file.
    const innerAllow = getBlocksForSurface("sidebar")
      .map((b) => b.name)
      .filter((name) => name !== "StickyContainer");

    // Defensive: in the rare case the block is mounted outside Puck's
    // <Render> (e.g. an isolated unit test), there's no context — we
    // skip the drop area rather than throw, so the rest of the layout
    // keeps rendering.
    const dropZone = DropZone ? <DropZone zone="content" allow={innerAllow} /> : null;
    const dropZoneEditor = DropZone ? (
      <DropZone zone="content" allow={innerAllow} minEmptyHeight={120} />
    ) : null;

    if (puck?.isEditing) {
      return (
        <div
          className="not-prose mb-4 rounded-lg border-2 border-dashed border-sky-400/50 bg-sky-50/40 p-3"
          style={{ top: `${topOffsetRem ?? 0}rem` }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-700">
            <span>Sticky Container</span>
            <span className="text-slate-400">
              · top {topOffsetRem ?? 0}rem · gap {gapRem ?? 1}rem
              {deferred ? " · pin deferred" : ""}
            </span>
          </div>
          <div className="flex flex-col rounded bg-white/60 p-2" style={innerStyle}>
            {dropZoneEditor}
          </div>
        </div>
      );
    }

    // The block render emits a plain `<div data-np-sticky>` carrying
    // its config in data-* attributes. A page-level client component
    // (`StickyContainerMounter`, mounted from `renderActiveTheme`
    // alongside `TableOfContentsMounter`) scans for these placeholders
    // on mount and wires the scroll watcher.
    //
    // We deliberately do NOT ship an inline `<script>` sibling here.
    // That earlier approach mutated `style.top` during HTML parse —
    // before React 19's hydration cycle — and React then diffed its
    // own render output against the mutated DOM and reported a
    // hydration mismatch. Bootstrapping from a `useEffect` (the
    // Mounter) lands strictly after hydration, so mutations are safe.
    // Same pattern Table of Contents uses for the same reason.
    return (
      // `z-10` keeps stacked widgets above plain content on overlap;
      // sticky header (z-30 in render.tsx) wins above this so a sticky
      // sidebar widget never paints over the navigation.
      <div
        id={stickyId}
        className="np-sticky-container not-prose sticky z-10"
        style={wrapperStyle}
        data-np-sticky=""
        data-sticky-offset={String(offsetPx)}
        data-sticky-deferred={deferred ? "1" : "0"}
      >
        <div className="flex flex-col" style={innerStyle}>
          {dropZone}
        </div>
      </div>
    );
  },
};

export const StickyContainerBlock: Omit<RegisteredBlock, "source"> = {
  name: "StickyContainer",
  config: StickyContainer,
  // Sidebar-only by design: the container's stickiness is bounded by
  // its parent's height, and the sidebar `<aside>` is the only chrome
  // surface that grid-stretches to match the main column. Dropping it
  // into a footer zone would technically work but the sticky range
  // would be ~footer height, which isn't useful.
  surfaces: ["sidebar"],
  category: "Site",
};
