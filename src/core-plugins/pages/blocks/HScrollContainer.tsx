"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Min thumb size in px so very wide content still has a draggable
   *  affordance. */
  minThumbWidth?: number;
}

interface ThumbState {
  left: number;
  width: number;
  visible: boolean;
}

const HIDDEN_THUMB: ThumbState = { left: 0, width: 0, visible: false };

/**
 * Scrollable container with a fully-custom horizontal scrollbar
 * rendered below the content. The native scrollbar is hidden via
 * `.no-native-scrollbar`. We own the scrollbar's appearance and
 * visibility entirely, so behaviour is consistent across platforms
 * (macOS auto-hide, Windows chunky bars, Firefox styling all
 * sidestepped). The thumb is draggable; the content scrolls with
 * pointer events on the thumb, mouse wheel inside the container, and
 * any other scroll mechanism the browser supports.
 */
export function HScrollContainer({ children, className, minThumbWidth = 32 }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ThumbState>(HIDDEN_THUMB);

  // Recompute thumb dimensions whenever the scroll position, the
  // visible width, or the content width changes. ResizeObserver covers
  // both the scroller (window resize, sidebar drag) and the inner
  // content (rows added / removed in the table builder).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    function recompute() {
      if (!scroller || !track) return;
      const trackWidth = track.clientWidth;
      const contentWidth = scroller.scrollWidth;
      const visibleWidth = scroller.clientWidth;
      if (contentWidth <= visibleWidth || trackWidth === 0) {
        setThumb(HIDDEN_THUMB);
        return;
      }
      const ratio = visibleWidth / contentWidth;
      const thumbWidth = Math.max(minThumbWidth, trackWidth * ratio);
      const maxScroll = contentWidth - visibleWidth;
      const maxThumb = trackWidth - thumbWidth;
      const left = maxScroll > 0 ? (scroller.scrollLeft / maxScroll) * maxThumb : 0;
      setThumb({ left, width: thumbWidth, visible: true });
    }

    recompute();
    scroller.addEventListener("scroll", recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    ro.observe(track);
    return () => {
      scroller.removeEventListener("scroll", recompute);
      ro.disconnect();
    };
  }, [minThumbWidth]);

  function startThumbDrag(e: React.PointerEvent) {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startScrollLeft = scroller.scrollLeft;
    const trackWidth = track.clientWidth;
    const visibleWidth = scroller.clientWidth;
    const contentWidth = scroller.scrollWidth;
    const maxScroll = Math.max(0, contentWidth - visibleWidth);
    const ratio = visibleWidth / contentWidth;
    const thumbWidth = Math.max(minThumbWidth, trackWidth * ratio);
    const maxThumb = Math.max(1, trackWidth - thumbWidth);

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      if (!scroller) return;
      const dx = ev.clientX - startX;
      const scrollDelta = (dx / maxThumb) * maxScroll;
      scroller.scrollLeft = Math.max(0, Math.min(maxScroll, startScrollLeft + scrollDelta));
    }
    function onUp() {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function jumpToTrackPosition(e: React.PointerEvent) {
    // Click anywhere on the track (but not the thumb itself) → jump
    // the thumb's centre to that point.
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const visibleWidth = scroller.clientWidth;
    const contentWidth = scroller.scrollWidth;
    const maxScroll = Math.max(0, contentWidth - visibleWidth);
    const ratio = visibleWidth / contentWidth;
    const thumbWidth = Math.max(minThumbWidth, rect.width * ratio);
    const maxThumb = Math.max(1, rect.width - thumbWidth);
    const targetThumbLeft = Math.max(0, Math.min(maxThumb, clickX - thumbWidth / 2));
    scroller.scrollLeft = (targetThumbLeft / maxThumb) * maxScroll;
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className ?? ""}`}>
      <div ref={scrollerRef} className="overflow-x-auto no-native-scrollbar">
        {children}
      </div>
      {/* The track is always rendered so its ref is stable on mount —
          recompute reads its clientWidth, and rendering it conditionally
          on `thumb.visible` would keep the ref null until something else
          made it visible (a chicken-and-egg loop). When there's no
          overflow we just hide the thumb instead. */}
      <div
        ref={trackRef}
        onPointerDown={thumb.visible ? jumpToTrackPosition : undefined}
        className={`relative mx-2 mb-2 mt-1 h-1.5 rounded-full bg-slate-100 ${thumb.visible ? "cursor-pointer" : ""}`}
      >
        <div
          // The thumb is a custom draggable affordance, not a real
          // ARIA scrollbar (no aria-controls wiring back to the
          // consumer). aria-hidden keeps it out of the a11y tree —
          // keyboard / wheel / touch scrolling still work via the
          // native scroll container.
          aria-hidden
          onPointerDown={thumb.visible ? startThumbDrag : undefined}
          style={{
            left: `${thumb.left}px`,
            width: `${thumb.width}px`,
            visibility: thumb.visible ? "visible" : "hidden",
          }}
          className="absolute top-0 h-full cursor-grab rounded-full bg-slate-400 transition-colors hover:bg-slate-500 active:cursor-grabbing active:bg-slate-600"
        />
      </div>
    </div>
  );
}
