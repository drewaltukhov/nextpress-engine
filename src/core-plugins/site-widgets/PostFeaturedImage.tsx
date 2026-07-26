import ReactDOM from "react-dom";
import type { ComponentConfig } from "@measured/puck";
import { toFeaturedMediumVariant } from "@core-plugins/media/storage/url";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PostDetail } from "@core-plugins/posts";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type PostFeaturedImageAspect = "original" | "video" | "square";

export type PostFeaturedImageProps = {
  rounded: boolean;
  aspect: PostFeaturedImageAspect;
};

interface PuckMetadataShape {
  post?: PostDetail;
}

// Tailwind purge sees the literal class names, so use a lookup instead
// of building `aspect-${name}` at runtime.
const ASPECT_CLASS: Record<Exclude<PostFeaturedImageAspect, "original">, string> = {
  video: "aspect-video",
  square: "aspect-square",
};

export const PostFeaturedImage: ComponentConfig<PostFeaturedImageProps> = {
  label: "Featured Image",
  fields: {
    aspect: {
      type: "radio",
      label: "Aspect ratio",
      options: [
        { label: "Original", value: "original" },
        { label: "16 / 9", value: "video" },
        { label: "Square", value: "square" },
      ],
    },
    rounded: {
      type: "radio",
      label: "Rounded corners",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: { rounded: true, aspect: "original" },
  render: ({ rounded, aspect, puck }) => {
    if (puck?.isEditing) {
      const aspectLabel = aspect === "video" ? "16 / 9" : aspect === "square" ? "Square" : "Original";
      return (
        <BuilderCard name="PostFeaturedImage"
          title="Featured Image"
          description={`Shows the post's featured image · ${aspectLabel}.`}
        />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const url = md.post?.featuredImage;
    if (!url) {
      return <></>;
    }
    const mediumUrl = toFeaturedMediumVariant(url) ?? url;
    // This image sits at the top of the post — the LCP element. Preload it at
    // high priority so the browser fetches it during the initial HTML parse,
    // before it reaches this widget's markup. `ReactDOM.preload` (React 19)
    // hoists a `<link rel="preload" as="image">` into `<head>`.
    ReactDOM.preload(mediumUrl, { as: "image", fetchPriority: "high" });
    // Older saved blocks may not include `aspect`; fall back to the
    // previous behavior (natural aspect, no crop).
    const safeAspect: PostFeaturedImageAspect = aspect ?? "original";
    const wrapperBase = `np-post-featured-image not-prose mb-5 ${rounded ? "overflow-hidden rounded-xl" : ""}`;
    if (safeAspect === "original") {
      return (
        <div className={wrapperBase}>
          {/* Featured image sits at the top of the post — it's the LCP element,
              so it loads eagerly with high priority and uses the ≤1280px WebP
              medium variant (falls back to the original safely). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediumUrl} alt="" className="w-full object-cover" loading="eager" fetchPriority="high" />
        </div>
      );
    }
    return (
      <div className={`${wrapperBase} ${ASPECT_CLASS[safeAspect]} w-full bg-slate-100`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediumUrl}
          alt=""
          className="h-full w-full object-cover object-center"
          loading="eager"
          fetchPriority="high"
        />
      </div>
    );
  },
};

export const PostFeaturedImageBlock: Omit<RegisteredBlock, "source"> = {
  name: "PostFeaturedImage",
  config: PostFeaturedImage,
  surfaces: ["template-single-post", "template-single-pillar"],
  category: "Template",
};
