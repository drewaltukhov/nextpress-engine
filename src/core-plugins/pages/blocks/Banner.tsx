import type { ComponentConfig, CustomField } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type BannerTarget = "_self" | "_blank";

export type BannerProps = {
  imageUrl: string;
  imageAlt: string;
  /** Free-text URL or `/<slug>` / `/<pillar>/<spike>` / `/topics/<slug>`
   *  picked from the content dialog. Empty string means "no link" — the
   *  banner renders as a plain image. */
  href: string;
  target: BannerTarget;
  /** Optional max-width override in rem. 0 means "use the image's natural
   *  size up to the container width" (default behavior). When > 0, the
   *  image is additionally capped at this width. */
  maxWidthRem: number;
};

const renderMediaField: CustomField<string>["render"] = function MediaFieldRender({
  value,
  onChange,
}) {
  return (
    <MediaPickerInput
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      allowUpload
      variant="preview"
    />
  );
};

const renderLinkField: CustomField<string>["render"] = function LinkFieldRender({
  value,
  onChange,
}) {
  return <ContentLinkInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
};

const ALL_FIELDS = {
  imageUrl: {
    type: "custom",
    label: "Image",
    render: renderMediaField,
  },
  imageAlt: {
    type: "text",
    label: "Alt text",
  },
  href: {
    type: "custom",
    label: "Link URL",
    render: renderLinkField,
  },
  target: {
    type: "radio",
    label: "Open in",
    options: [
      { label: "Same tab", value: "_self" },
      { label: "New tab", value: "_blank" },
    ],
  },
  maxWidthRem: {
    type: "number",
    label: "Max width (rem) — 0 = auto",
    min: 0,
    max: 96,
    step: 1,
  },
} as const satisfies ComponentConfig<BannerProps>["fields"];

export const Banner: ComponentConfig<BannerProps> = {
  label: "Banner",
  fields: ALL_FIELDS,
  defaultProps: {
    imageUrl: "",
    imageAlt: "",
    href: "",
    target: "_self",
    maxWidthRem: 0,
  },
  render: ({ imageUrl, imageAlt, href, target, maxWidthRem, puck }) => {
    // Cap the image to either the container width (default) or the
    // smaller of the container and the user-provided rem override.
    // `width: auto` + `max-width` means the browser displays at the
    // image's natural width when smaller than the cap.
    const cap = maxWidthRem > 0 ? `min(100%, ${maxWidthRem}rem)` : "100%";
    const imgStyle: CSSProperties = {
      maxWidth: cap,
      width: "auto",
      height: "auto",
    };
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };

    // Theme builder: uniform card preview (the schematic should never
    // mix bare images with labeled cards). Page/post editor + public:
    // render the actual image so authors get a WYSIWYG preview.
    if (puck?.isEditing && md.themeBuilder) {
      const linkSummary = href ? `${href} (${target === "_blank" ? "new tab" : "same tab"})` : "no link";
      const description = imageUrl ? linkSummary : "Pick or upload an image, then optionally link it.";
      return (
        <BuilderCard name="Banner" title="Banner" description={description}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={imageAlt} className="not-prose block" style={imgStyle} />
          ) : null}
        </BuilderCard>
      );
    }

    if (!imageUrl) {
      // Page/post editor with no image yet — show a clickable
      // placeholder so the block stays selectable. Public render: empty.
      if (puck?.isEditing) {
        return (
          <div className="not-prose mb-4 flex h-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/60 text-xs text-slate-400">
            Banner — pick or upload an image in the inspector.
          </div>
        );
      }
      return <></>;
    }

    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={imageAlt} className="not-prose block" style={imgStyle} />
    );

    if (!href) {
      return <div className="np-banner not-prose mb-4">{img}</div>;
    }

    return (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className="np-banner not-prose mb-4 inline-block no-underline"
      >
        {img}
      </a>
    );
  },
};

export const BannerBlock: Omit<RegisteredBlock, "source"> = {
  name: "Banner",
  config: Banner,
  surfaces: [
    "page-content",
    "post-content",
    "footer",
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
