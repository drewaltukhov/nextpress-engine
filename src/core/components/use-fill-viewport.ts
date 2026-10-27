"use client";

import { useLayoutEffect, useState } from "react";

/** Below this the block keeps its height and the page scrolls instead: a short laptop
 *  window (MacBook Neo-class, ~650–750px tall) would otherwise leave the editor a sliver. */
export const FILL_MIN_HEIGHT = 600;

/** The height that makes a block end exactly `bottomGap` px above the window's bottom edge. */
export function fillHeight(viewport: number, top: number, bottomGap: number): number {
  return Math.max(FILL_MIN_HEIGHT, Math.floor(viewport - top - bottomGap));
}

/**
 * Sizes a block to the rest of the window below where it starts, so the page itself
 * does not scroll and the block's columns scroll on their own (the post and page
 * editors). The start is measured, not hard-coded, because what sits above it varies
 * (the maintenance banner, the title box). Re-measured on resize and whenever the
 * page's layout shifts. `bottomGap` is the space kept under the block: the admin
 * main area's bottom padding.
 *
 * `ref` is a callback ref: Puck remounts its children after loading, and a measured
 * element that has left the page reads as top 0 (the block then came out as tall as
 * the whole window). Following whichever element is attached avoids that.
 */
export function useFillViewport<T extends HTMLElement>(bottomGap = 32) {
  const [el, ref] = useState<T | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      if (!el.isConnected) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(fillHeight(window.innerHeight, top, bottomGap));
    };
    measure();
    window.addEventListener("resize", measure);
    // A banner or the title box changing height moves the block's start; the
    // measurement does not depend on the block's own height, so this settles.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [el, bottomGap]);

  return { ref, height };
}
