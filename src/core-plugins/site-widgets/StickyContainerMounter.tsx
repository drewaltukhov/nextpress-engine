"use client";

import { useEffect } from "react";

/**
 * Page-level bootstrapper for every Sticky Container widget on a
 * public route.
 *
 * Why this lives outside Puck's tree (same shape as
 * `TableOfContentsMounter`):
 *   The StickyContainer block ships a plain `<div data-np-sticky>`
 *   carrying its config in `data-sticky-*` attributes. Wiring the
 *   scroll watcher from an inline `<script>` sibling — the previous
 *   approach — was rendered inside Puck's RSC `<Render>` and mutated
 *   `style.top` during HTML parse, which lands BEFORE React 19's
 *   hydration cycle. React then diffed its own render output
 *   (untouched style) against the now-mutated DOM and reported a
 *   hydration mismatch. Moving the wiring into a `useEffect` here
 *   guarantees DOM mutations happen strictly after hydration. No
 *   mismatch, no "use client" component inside the Puck render tree
 *   (so no Puck/RSC dispatcher entanglement either).
 *
 * Behavior matches the previous inline watcher:
 *   - Default sticky (immediate mode): keep `top` at the configured
 *     offset; CSS sticky pins as usual. Toggle `is-sticky` on/off as
 *     the bounding rect crosses the offset line.
 *   - Deferred mode: keep `top` at -99999px (sticky disabled) until
 *     every other sibling widget in the same parent has its bottom
 *     above the offset line. On engage, swap `top` to offsetPx and
 *     play the `np-pin-enter` slide-in. On disengage, play the
 *     `np-pin-exit` slide-up while still pinned, then swap `top`
 *     back to -99999px when the animation ends.
 *   - A monotonic token cancels stale exit timeouts on rapid
 *     direction reversal.
 *   - The `r`-flag deferred-by-rAF first observation is no longer
 *     needed here: `useEffect` already fires post-hydration, and by
 *     the time it runs the entire DOM (siblings included) is parsed.
 */

interface StickyConfig {
  offsetPx: number;
  deferred: boolean;
}

function readConfig(el: HTMLElement): StickyConfig {
  const offsetPx = Number.parseInt(el.dataset.stickyOffset ?? "0", 10) || 0;
  const deferred = el.dataset.stickyDeferred === "1";
  return { offsetPx, deferred };
}

interface InstanceState {
  prev: number; // -1 = uninitialized, 0 = inactive, 1 = active
  token: number;
}

function siblingsOut(el: HTMLElement, offsetPx: number): boolean {
  const parent = el.parentElement;
  if (!parent) return true;
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const s = children[i] as HTMLElement;
    if (s === el || s.tagName === "SCRIPT") continue;
    if (s.getBoundingClientRect().bottom > offsetPx + 0.5) return false;
  }
  return true;
}

function wire(el: HTMLElement): () => void {
  const cfg = readConfig(el);
  const state: InstanceState = { prev: -1, token: 0 };

  function update(): void {
    const active = !cfg.deferred || siblingsOut(el, cfg.offsetPx);
    const t = el.getBoundingClientRect().top;

    if (state.prev === -1) {
      // First observation — set the state without animation.
      el.style.top = active ? `${cfg.offsetPx}px` : "-99999px";
    } else if (!cfg.deferred) {
      // Immediate mode — keep top at offset, no transitions.
      el.style.top = `${cfg.offsetPx}px`;
    } else if ((active ? 1 : 0) !== state.prev) {
      // Deferred mode — animate the engage / disengage edge.
      state.token += 1;
      const tk = state.token;
      if (active) {
        // Engage: swap top, then trigger the slide-in keyframe.
        el.style.top = `${cfg.offsetPx}px`;
        el.classList.remove("np-pin-exit");
        el.classList.remove("np-pin-enter");
        // Force a reflow so the next class add restarts the animation
        // from frame zero instead of being deduped by the browser.
        void el.offsetWidth;
        el.classList.add("np-pin-enter");
      } else {
        // Disengage: keep top pinned while the slide-up plays; swap
        // to -99999px ONLY after the animation ends, otherwise sticky
        // disengages immediately and the element teleports back to
        // its in-flow position before the keyframe can run.
        el.classList.remove("np-pin-enter");
        el.classList.remove("np-pin-exit");
        void el.offsetWidth;
        el.classList.add("np-pin-exit");
        setTimeout(() => {
          // Token check: if the user reversed direction during the
          // animation, this timeout is stale and must no-op.
          if (state.token !== tk) return;
          el.style.top = "-99999px";
          el.classList.remove("np-pin-exit");
        }, 320);
      }
    }

    el.classList.toggle("is-sticky", active && t <= cfg.offsetPx + 0.5);
    state.prev = active ? 1 : 0;
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
  return () => {
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}

export function StickyContainerMounter(): null {
  useEffect(() => {
    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>("[data-np-sticky]"),
    );
    if (hosts.length === 0) return;
    const teardown: Array<() => void> = [];
    for (const host of hosts) {
      teardown.push(wire(host));
    }
    return () => {
      for (const fn of teardown) fn();
    };
  }, []);
  return null;
}
