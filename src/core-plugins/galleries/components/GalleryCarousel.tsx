"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryDetail } from "../service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface Props {
  gallery: GalleryDetail;
  showCaptions: boolean;
  showArrows: boolean;
  showDots: boolean;
  /** Tap a slide to open the full-size lightbox. Disabled inside the
   *  Puck editor canvas regardless — clicks there belong to block
   *  selection, not navigation. */
  enableLightbox: boolean;
  /** Editor mode keeps the carousel functional but harmless for Puck's
   *  block-selection handling — embla doesn't intercept selection events. */
  mode: "editor" | "public";
}

export function GalleryCarousel({
  gallery,
  showCaptions,
  showArrows,
  showDots,
  enableLightbox,
  mode,
}: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxActive = enableLightbox && mode === "public";

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    // Carousel caps at max-w-3xl (768px) and centers, matching the YouTube
    // embed sizing. Keeps inline carousels from stretching edge-to-edge in
    // full-bleed Puck sections — lightbox-click still serves the full
    // original at viewport width when you want the big view.
    <div className="not-prose mx-auto w-full max-w-3xl">
      <div className="relative">
        <div ref={emblaRef} className="overflow-hidden rounded-lg bg-black">
          <div className="flex">
            {gallery.items.map((it, i) => {
              const altText = it.altText ?? it.filename;
              // Inline carousel slides use the 1280px medium variant — sized
              // to look crisp at the max-w-3xl container's 768px width on
              // retina displays. Legacy rows without a medium fall back to
              // the original via the route handler. Lightbox below still
              // uses the full original for zoom.
              const slideSrc = getMediaPublicUrl({
                id: it.mediaId,
                hasThumb: it.hasThumb,
                hasMedium: it.hasMedium,
                variant: "medium",
                contentVersion: it.contentVersion,
              });
              const slideImg = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slideSrc}
                  alt={altText}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              );
              return (
                <div key={it.mediaId} className="relative min-w-0 flex-[0_0_100%]">
                  <div className="aspect-video">
                    {lightboxActive ? (
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        aria-label={`Enlarge image ${i + 1} of ${gallery.items.length}`}
                        className="block h-full w-full cursor-zoom-in"
                      >
                        {slideImg}
                      </button>
                    ) : (
                      slideImg
                    )}
                  </div>
                  {showCaptions && it.caption && (
                    <div className="bg-black/60 px-4 py-2 text-sm text-white">
                      {it.caption}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {showArrows && gallery.items.length > 1 && (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {showDots && gallery.items.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {gallery.items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`size-2 rounded-full transition ${
                i === selectedIndex ? "bg-slate-800" : "bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}

      {lightboxActive && (
        <Lightbox
          open={lightboxIndex !== null}
          index={lightboxIndex ?? 0}
          close={() => setLightboxIndex(null)}
          slides={gallery.items.map((it) => ({
            src: getMediaPublicUrl({
              id: it.mediaId,
              hasThumb: it.hasThumb,
              variant: "original",
              contentVersion: it.contentVersion,
            }),
            alt: it.altText ?? it.filename,
            description: it.caption ?? undefined,
            width: it.width ?? undefined,
            height: it.height ?? undefined,
          }))}
        />
      )}
    </div>
  );
}
