"use client";

import { useEffect, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

/**
 * Page-level bootstrapper for every Image block whose
 * `enableLightbox` option is on. Mirrors the
 * `TableOfContentsMounter` pattern: the Image block renders a plain
 * `<img data-np-img-lightbox="">` server-side (no hooks, no client
 * component), and this mounter — placed once per route by
 * `renderActiveTheme`, OUTSIDE Puck's RSC `<Render>` subtree —
 * delegates clicks on those images to a single shared lightbox.
 *
 * Why not a per-image React wrapper:
 *   `"use client"` components called from inside Puck's RSC
 *   `<Render>` consistently destabilise the dispatcher boundary
 *   (same class of failure we hit with TOC and Gallery). Direct
 *   import of a hooks-using component into the block file shipped
 *   "Cannot read properties of null (reading 'useState')" through
 *   the SSR pass. The vanilla-DOM mounter pattern sidesteps that
 *   entirely.
 *
 * Behaviour:
 *   - Click any `[data-np-img-lightbox]` image → open the lightbox
 *     showing that image's `src`. Alt text comes from the original
 *     image's `alt` attribute (or a `data-img-alt` override).
 *   - Single-image lightbox: prev / next arrows are hidden because
 *     each Image block stands alone (Galleries already use their own
 *     multi-slide lightbox).
 */
export function ImageLightboxMounter(): React.JSX.Element | null {
  const [slide, setSlide] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // `closest` covers the case where the user clicks an inline
      // child (e.g. a `<picture>` source or a wrapping `<figure>`),
      // letting whoever shipped the placeholder choose where to put
      // the data attribute.
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const host = target.closest<HTMLElement>("[data-np-img-lightbox]");
      if (!host) return;
      // Resolve the actual image. If the host IS an `<img>`, use it
      // directly; otherwise fall back to the first descendant image.
      const img =
        host.tagName === "IMG"
          ? (host as HTMLImageElement)
          : host.querySelector<HTMLImageElement>("img");
      if (!img || !img.src) return;
      e.preventDefault();
      setSlide({
        src: img.src,
        alt:
          host.dataset.imgAlt ??
          img.getAttribute("alt") ??
          "",
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <Lightbox
      open={slide !== null}
      close={() => setSlide(null)}
      slides={slide ? [slide] : []}
      // Single image — hide nav buttons / counter chrome.
      carousel={{ finite: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
    />
  );
}
