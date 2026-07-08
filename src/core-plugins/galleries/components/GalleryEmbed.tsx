"use client";

import type { GalleryDetail } from "../service";
import { GalleryGrid } from "./GalleryGrid";
import { GalleryCarousel } from "./GalleryCarousel";
import { GalleryMasonry } from "./GalleryMasonry";

export type GalleryLayout = "grid-lightbox" | "carousel" | "masonry";

interface Props {
  gallery: GalleryDetail;
  layout: GalleryLayout;
  showCaptions: boolean;
  showArrows: boolean;
  showDots: boolean;
  /** Masonry column count (1–12). */
  columns: number;
  /** Masonry gap between images, in rems (0–5). */
  gap: number;
  /** Drop rounded corners on images (grid + masonry). */
  removeRadius: boolean;
  /** Carousel + masonry: tap an image to open the full-size lightbox.
   *  When off for masonry, images render plain with no link. */
  enableLightbox: boolean;
  /** Editor mode tames interactive bits (lightbox click, etc.) so the
   *  Puck canvas selection handling stays responsive. Public mode renders
   *  the full real interactive layout. */
  mode: "editor" | "public";
}

export function GalleryEmbed({
  gallery,
  layout,
  showCaptions,
  showArrows,
  showDots,
  columns,
  gap,
  removeRadius,
  enableLightbox,
  mode,
}: Props) {
  if (gallery.items.length === 0) {
    return (
      <div
        className="not-prose mb-4 flex items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-sm text-slate-500"
      >
        Gallery &quot;{gallery.name}&quot; has no items yet.
      </div>
    );
  }

  // Wrap both layouts in a 1rem-bottom-margin container — keeps the
  // default-block-spacing convention in one place rather than duplicating
  // it across GalleryGrid and GalleryCarousel.
  return (
    <div className="mb-4">
      {layout === "carousel" ? (
        <GalleryCarousel
          gallery={gallery}
          showCaptions={showCaptions}
          showArrows={showArrows}
          showDots={showDots}
          enableLightbox={enableLightbox}
          mode={mode}
        />
      ) : layout === "masonry" ? (
        <GalleryMasonry
          gallery={gallery}
          columns={columns}
          gap={gap}
          showCaptions={showCaptions}
          removeRadius={removeRadius}
          enableLightbox={enableLightbox}
          mode={mode}
        />
      ) : (
        <GalleryGrid
          gallery={gallery}
          showCaptions={showCaptions}
          removeRadius={removeRadius}
          mode={mode}
        />
      )}
    </div>
  );
}
