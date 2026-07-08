import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GalleryMasonry,
  masonryColumnClasses,
  masonryGapRem,
} from "../../../../src/core-plugins/galleries/components/GalleryMasonry";
import type { GalleryDetail, GalleryItem } from "../../../../src/core-plugins/galleries/service";

function item(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    mediaId: "m1",
    position: 0,
    caption: null,
    filename: "photo.jpg",
    mime: "image/jpeg",
    altText: "A photo",
    width: 1600,
    height: 900,
    storageBackend: "db",
    storageRef: "ref",
    hasThumb: true,
    hasMedium: true,
    contentVersion: "v1",
    ...overrides,
  };
}

function gallery(items: GalleryItem[]): GalleryDetail {
  return {
    id: 1,
    name: "Test",
    slug: "test",
    description: null,
    coverMediaId: null,
    coverStorageBackend: null,
    coverStorageRef: null,
    coverHasThumb: false,
    coverContentVersion: "v1",
    itemCount: items.length,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    items,
  };
}

const G = gallery([
  item({ mediaId: "a", caption: "First" }),
  item({ mediaId: "b", caption: null }),
]);

describe("masonryColumnClasses", () => {
  it("maps the default (3) to a responsive 2→3 column set", () => {
    expect(masonryColumnClasses(3)).toBe("columns-2 lg:columns-3");
  });

  it("caps mobile at 2 columns for large counts", () => {
    expect(masonryColumnClasses(12)).toBe("columns-2 sm:columns-6 lg:columns-12");
  });

  it("clamps out-of-range values into 1–12", () => {
    expect(masonryColumnClasses(0)).toBe("columns-1");
    expect(masonryColumnClasses(99)).toBe("columns-2 sm:columns-6 lg:columns-12");
  });

  it("falls back to the 2-column default for non-finite input", () => {
    expect(masonryColumnClasses(Number.NaN)).toBe("columns-2");
  });
});

describe("masonryGapRem", () => {
  it("clamps to the 0–5 range", () => {
    expect(masonryGapRem(-1)).toBe(0);
    expect(masonryGapRem(7)).toBe(5);
    expect(masonryGapRem(1.5)).toBe(1.5);
  });

  it("falls back to 1rem for non-finite input", () => {
    expect(masonryGapRem(Number.NaN)).toBe(1);
  });
});

describe("GalleryMasonry — rendering", () => {
  it("uses multi-column layout for the chosen columns", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={4}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).toMatch(/lg:columns-4/);
  });

  it("preserves aspect ratio — no aspect-square / object-cover, images are w-full h-auto", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).not.toMatch(/aspect-square/);
    expect(html).not.toMatch(/object-cover/);
    expect(html).toMatch(/h-auto w-full/);
  });

  it("applies the gap to both column-gap and item margin-bottom", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={2.5}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).toMatch(/column-gap:2\.5rem/);
    expect(html).toMatch(/margin-bottom:2\.5rem/);
  });

  it("keeps rounded corners when removeRadius is false", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).toMatch(/rounded-lg/);
  });

  it("drops rounded corners when removeRadius is true", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius
        enableLightbox
        mode="public"
      />,
    );
    expect(html).not.toMatch(/rounded-lg/);
  });

  it("renders links when lightbox is enabled (public)", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).toMatch(/<a /);
  });

  it("renders plain images with no links when lightbox is disabled", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox={false}
        mode="public"
      />,
    );
    expect(html).not.toMatch(/<a /);
    expect(html).toMatch(/<img /);
  });

  it("never renders links in editor mode, even with lightbox enabled", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="editor"
      />,
    );
    expect(html).not.toMatch(/<a /);
  });

  it("renders captions when showCaptions is true", () => {
    const html = renderToStaticMarkup(
      <GalleryMasonry
        gallery={G}
        columns={3}
        gap={1}
        showCaptions
        removeRadius={false}
        enableLightbox
        mode="public"
      />,
    );
    expect(html).toMatch(/First/);
  });
});
