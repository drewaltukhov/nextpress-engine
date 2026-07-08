import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { BlockPlaceholder } from "./_placeholder";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type ImageProps = {
  url: string;
  alt: string;
  /** When true, the rendered image acts as a click target that opens
   *  a full-size lightbox overlay. Editor canvas keeps the plain
   *  image (no click handler) so the lightbox doesn't fight Puck's
   *  selection. */
  enableLightbox: boolean;
};

const renderMediaField: CustomField<string>["render"] = function MediaFieldRender({
  value,
  onChange,
}) {
  // `variant="stacked"` puts the action buttons (Browse / Upload /
  // Clear) on the top row and the URL field full-width below — fits
  // the narrow Puck inspector column better than the default inline
  // layout. `allowUpload` enables the quick-upload button, so all
  // three entry paths (paste URL, pick from media, quick upload) are
  // visible at once.
  return (
    <MediaPickerInput
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      allowUpload
      variant="stacked"
    />
  );
};

export const Image: ComponentConfig<ImageProps> = {
  label: "Image",
  fields: {
    url: {
      type: "custom",
      label: "Image",
      render: renderMediaField,
    },
    alt: { type: "text", label: "Alt text" },
    enableLightbox: {
      type: "radio",
      label: "Click to enlarge (lightbox)",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
  },
  // `enableLightbox` defaults to off so existing Image blocks (saved
  // before this field was added) keep their previous behaviour — the
  // image renders as a plain `<img>` with no click handler.
  defaultProps: { url: "", alt: "", enableLightbox: false },
  render: ({ url, alt, enableLightbox, puck }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    if (puck?.isEditing && md.themeBuilder) {
      const desc = url
        ? `Image · ${alt || "no alt text"}${enableLightbox ? " · Lightbox on" : ""}`
        : "Single image — set URL and alt text in the inspector.";
      return <BuilderCard name="Image" title="Image" description={desc} />;
    }
    if (!url) {
      return <BlockPlaceholder>Image — set URL in the Widget Settings panel</BlockPlaceholder>;
    }
    // Lightbox is wired through `data-np-img-lightbox` rather than a
    // React component because hooks-using "use client" widgets are
    // unreliable when rendered through Puck's RSC `<Render>` (the
    // dispatcher fails — same class of issue we hit with TOC). The
    // plain `<img>` ships through every render path safely; a single
    // page-level bootstrapper (`ImageLightboxMounter`, mounted by
    // `renderActiveTheme`) finds these `[data-np-img-lightbox]`
    // elements on the client and opens a lightbox on click. The
    // editor canvas (`puck.isEditing`) gets a plain image with no
    // data attribute so clicks belong to Puck's selection handling.
    const lightboxAttrs =
      enableLightbox && !puck?.isEditing
        ? {
            "data-np-img-lightbox": "",
            "data-img-alt": alt,
            style: {
              maxWidth: "100%",
              height: "auto",
              cursor: "zoom-in",
            } as const,
          }
        : { style: { maxWidth: "100%", height: "auto" } as const };
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="np-image" src={url} alt={alt} {...lightboxAttrs} />;
  },
};

export const ImageBlock: Omit<RegisteredBlock, "source"> = {
  name: "Image",
  config: Image,
  surfaces: [
    "page-content",
    "post-content",
    "sidebar",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-not-found",
    "template-author",
  ],
  category: "Media",
};
