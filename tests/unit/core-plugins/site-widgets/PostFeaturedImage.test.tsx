import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  PostFeaturedImage,
  type PostFeaturedImageProps,
} from "../../../../src/core-plugins/site-widgets/PostFeaturedImage";

type PuckRenderArg = Parameters<typeof PostFeaturedImage.render>[0];

function render(props: Partial<PostFeaturedImageProps>, metadata: Record<string, unknown>): string {
  const arg = {
    ...PostFeaturedImage.defaultProps,
    ...props,
    puck: { isEditing: false, metadata },
  } as unknown as PuckRenderArg;
  const node = PostFeaturedImage.render(arg) as ReactElement | null;
  return renderToStaticMarkup(<>{node}</>);
}

const post = { featuredImage: "/media/a2e66fd0-0de2-429b-bf09-4f1a0f05f50e" };

// renderActiveTheme resolves the image's intrinsic size; the widget must put
// it on the <img> so the browser reserves the box before the LCP image loads.
describe("PostFeaturedImage — intrinsic size (CLS)", () => {
  it("sets width/height from featuredImageDims on the natural-aspect image", () => {
    const html = render({ aspect: "original" }, { post, featuredImageDims: { width: 1920, height: 1080 } });
    expect(html).toMatch(/<img[^>]*width="1920"[^>]*height="1080"/);
  });

  it("sets width/height on the cropped-aspect image too", () => {
    const html = render({ aspect: "video" }, { post, featuredImageDims: { width: 1920, height: 1080 } });
    expect(html).toMatch(/<img[^>]*width="1920"[^>]*height="1080"/);
  });

  it("omits width/height when the size is unknown", () => {
    const html = render({ aspect: "original" }, { post, featuredImageDims: null });
    expect(html).toMatch(/<img/);
    expect(html).not.toMatch(/width="/);
  });
});
