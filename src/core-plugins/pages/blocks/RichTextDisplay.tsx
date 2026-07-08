"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import type { MediaSummary } from "@core-plugins/media/service";

interface Props {
  /** RichText HTML *with media shortcodes already expanded* — see
   *  `expandMediaShortcodes` upstream. The HTML carries
   *  `data-np-shortcode` / `data-np-id` markers we delegate clicks on. */
  html: string;
  /** Media map keyed by id, sourced from Puck metadata. Drives the
   *  lightbox slides (alt, width, height). Empty map = no lightbox; the
   *  shortcodes still render as plain images via the public `/media/{id}`
   *  route, just without click-to-zoom enrichment. */
  media: Record<string, MediaSummary>;
}

/**
 * Render RichText HTML and wire up a single delegated click handler that
 * opens a lightbox for any element marked `data-np-shortcode`. The lightbox
 * shows the full-size image regardless of whether the user clicked a thumb
 * or a full image — the shortcode variant only controls the inline display
 * size.
 */
export function RichTextDisplay({ html, media }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Slide list = every shortcode-marked element in render order, deduped on
  // id. Building this from the DOM (not the string) keeps lightbox order in
  // sync with what the user actually sees, even if a shortcode is repeated.
  const slides = useMemo(() => {
    return Object.values(media).map((m) => ({
      src: `/media/${m.id}`,
      alt: m.altText ?? m.filename,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
    }));
  }, [media]);

  const indexById = useMemo(() => {
    const map: Record<string, number> = {};
    Object.keys(media).forEach((id, i) => {
      map[id] = i;
    });
    return map;
  }, [media]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function handleClick(e: MouseEvent) {
      // Walk up from the click target to find the nearest shortcode marker.
      // Catches both the `<img data-np-shortcode="img">` case (target IS the
      // marker) and the `<button data-np-shortcode="thumb"><img></button>`
      // case (target is the inner img).
      const target = e.target as HTMLElement | null;
      const marker = target?.closest("[data-np-shortcode]") as HTMLElement | null;
      if (!marker) return;
      const id = marker.dataset.npId;
      if (!id) return;
      // Only intercept when the media is in our map — lets unknown ids
      // (deleted media, typos) fall through to the browser's default
      // behaviour (broken image, no lightbox).
      if (!(id in indexById)) return;
      e.preventDefault();
      setActiveId(id);
    }

    root.addEventListener("click", handleClick);
    return () => {
      root.removeEventListener("click", handleClick);
    };
  }, [indexById]);

  return (
    <>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
      {slides.length > 0 && (
        <Lightbox
          open={activeId !== null}
          index={activeId !== null ? indexById[activeId] ?? 0 : 0}
          close={() => setActiveId(null)}
          slides={slides}
        />
      )}
    </>
  );
}
