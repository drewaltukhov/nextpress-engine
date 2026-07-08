"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import type { GalleryDetail } from "../service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

interface Props {
  gallery: GalleryDetail;
  /** Render <figcaption> under each thumbnail. Lightbox captions are a
   *  separate surface and stay visible regardless of this flag. */
  showCaptions: boolean;
  /** Drop the rounded corners on tiles when true. */
  removeRadius: boolean;
  /** When "editor", clicks are suppressed so they don't fight Puck's
   *  selection handling. The grid markup itself still renders fully so
   *  the canvas shows real thumbnails + real layout (WYSIWYG). */
  mode: "editor" | "public";
}

export function GalleryGrid({ gallery, showCaptions, removeRadius, mode }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const radiusClass = removeRadius ? "" : "rounded-lg";

  // Lightbox slides serve the full-size original — that's the "open to view
  // at full quality" surface. The grid tiles below use the 600px thumb.
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
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 list-none p-0 m-0">
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
          // In editor mode, render <a> elements as plain <span> so clicks
          // don't bubble into a navigation; in public mode, the link is
          // also the no-JS fallback (open the full-size media).
          const caption =
            showCaptions && it.caption ? (
              <figcaption className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                {it.caption}
              </figcaption>
            ) : null;
          if (mode === "editor") {
            return (
              <li key={it.mediaId}>
                <figure className="m-0">
                  <span
                    className={`block aspect-square overflow-hidden ${radiusClass} bg-slate-100`}
                    title={altText}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb}
                      alt={altText}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </span>
                  {caption}
                </figure>
              </li>
            );
          }
          return (
            <li key={it.mediaId}>
              <figure className="m-0">
                <a
                  href={fullUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenIndex(i);
                  }}
                  className={`block aspect-square overflow-hidden ${radiusClass} bg-slate-100 transition hover:opacity-90`}
                  aria-label={`Open image ${i + 1} of ${gallery.items.length}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt={altText}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>
                {caption}
              </figure>
            </li>
          );
        })}
      </ul>

      {mode === "public" && (
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
