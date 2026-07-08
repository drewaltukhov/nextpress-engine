"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import type { GalleryDetail } from "../service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface Props {
  gallery: GalleryDetail;
  /** Number of masonry columns at desktop width (1–12). Steps down on
   *  smaller screens — see masonryColumnClasses. */
  columns: number;
  /** Spacing between images, in rems (0–5). Drives both the horizontal
   *  column gap and the vertical margin between stacked items. */
  gap: number;
  /** Render <figcaption> under each image. */
  showCaptions: boolean;
  /** Drop the rounded corners on images when true. */
  removeRadius: boolean;
  /** When true, each image links to / opens the full-size lightbox. When
   *  false, images render plain with no link at all. */
  enableLightbox: boolean;
  /** Editor mode renders non-interactive wrappers so clicks don't fight
   *  Puck's selection handling. The masonry markup itself still renders
   *  fully so the canvas shows real thumbnails + real layout (WYSIWYG). */
  mode: "editor" | "public";
}

// CSS multi-column count per chosen column setting, stepped down on smaller
// screens (mobile capped at 2, tablet ~half, desktop = chosen N). Spelled out
// as static class strings so Tailwind's JIT scanner picks them up — the same
// approach PostListView uses for its grid columns.
const MASONRY_COLUMN_CLASSES: Record<number, string> = {
  1: "columns-1",
  2: "columns-2",
  3: "columns-2 lg:columns-3",
  4: "columns-2 lg:columns-4",
  5: "columns-2 sm:columns-3 lg:columns-5",
  6: "columns-2 sm:columns-3 lg:columns-6",
  7: "columns-2 sm:columns-4 lg:columns-7",
  8: "columns-2 sm:columns-4 lg:columns-8",
  9: "columns-2 sm:columns-5 lg:columns-9",
  10: "columns-2 sm:columns-5 lg:columns-10",
  11: "columns-2 sm:columns-6 lg:columns-11",
  12: "columns-2 sm:columns-6 lg:columns-12",
};

/** Clamp the column setting to 1–12 and map it to responsive `columns-*`
 *  utility classes. Falls back to the 2-column default for bad input. */
export function masonryColumnClasses(columns: number): string {
  const n = Math.min(12, Math.max(1, Math.round(columns)));
  return MASONRY_COLUMN_CLASSES[n] ?? MASONRY_COLUMN_CLASSES[2];
}

/** Clamp the gap setting to the 0–5rem range, falling back to 1rem. */
export function masonryGapRem(gap: number): number {
  return Number.isFinite(gap) ? Math.min(5, Math.max(0, gap)) : 1;
}

export function GalleryMasonry({
  gallery,
  columns,
  gap,
  showCaptions,
  removeRadius,
  enableLightbox,
  mode,
}: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const lightboxActive = enableLightbox && mode === "public";
  const gapRem = masonryGapRem(gap);
  const radiusClass = removeRadius ? "" : "rounded-lg";

  // Lightbox slides serve the full-size original; the masonry tiles use the
  // 600px thumb, which preserves the original aspect ratio (no square crop).
  const slides = gallery.items.map((it) => ({
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
  }));

  return (
    <div className="not-prose">
      <ul
        className={`${masonryColumnClasses(columns)} list-none p-0 m-0`}
        style={{ columnGap: `${gapRem}rem` }}
      >
        {gallery.items.map((it, i) => {
          const thumb = getMediaPublicUrl({
            id: it.mediaId,
            hasThumb: it.hasThumb,
            variant: "thumb",
            contentVersion: it.contentVersion,
          });
          const fullUrl = getMediaPublicUrl({
            id: it.mediaId,
            hasThumb: it.hasThumb,
            variant: "original",
            contentVersion: it.contentVersion,
          });
          const altText = it.altText ?? it.filename;
          const caption =
            showCaptions && it.caption ? (
              <figcaption className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                {it.caption}
              </figcaption>
            ) : null;

          // Images keep their natural aspect ratio (w-full h-auto, no
          // object-cover / aspect-square) so the masonry staggers like the
          // source images rather than forcing a square grid.
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt={altText}
              width={it.width ?? undefined}
              height={it.height ?? undefined}
              className={`block h-auto w-full ${radiusClass} bg-slate-100`}
              loading="lazy"
            />
          );

          // Editor: never a link (clicks belong to Puck selection).
          // Public + lightbox: <a> that opens the lightbox, with the
          // full-size href as the no-JS fallback.
          // Public, no lightbox: plain image, no link.
          let media: React.ReactNode;
          if (mode === "public" && lightboxActive) {
            media = (
              <a
                href={fullUrl}
                onClick={(e) => {
                  e.preventDefault();
                  setOpenIndex(i);
                }}
                className="block transition hover:opacity-90"
                aria-label={`Open image ${i + 1} of ${gallery.items.length}`}
              >
                {img}
              </a>
            );
          } else {
            media = img;
          }

          return (
            <li
              key={it.mediaId}
              className="break-inside-avoid"
              style={{ marginBottom: `${gapRem}rem` }}
            >
              <figure className="m-0">
                {media}
                {caption}
              </figure>
            </li>
          );
        })}
      </ul>

      {lightboxActive && (
        <Lightbox
          open={openIndex !== null}
          index={openIndex ?? 0}
          close={() => setOpenIndex(null)}
          slides={slides}
        />
      )}
    </div>
  );
}
