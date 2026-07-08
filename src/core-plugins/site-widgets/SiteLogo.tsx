import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type SiteLogoProps = {
  imageUrl: string;
  alt: string;
  href: string;
  height: number;
  /** Optional alternate image shown at viewports below `md` (768px) — e.g.
   *  a compact mark instead of a full wordmark. When empty, the desktop
   *  image is reused at the mobile height. */
  mobileImageUrl?: string;
  /** Height in px applied below `md` (768px). Defaults to `height` when
   *  unset so existing saved blocks keep their current look. */
  mobileHeight?: number;
};

interface PuckMetadataShape {
  themeLogoUrl?: string;
}

export const SiteLogo: ComponentConfig<SiteLogoProps> = {
  label: "Site Logo",
  fields: {
    imageUrl: {
      type: "custom",
      label: "Logo image",
      render: ({ value, onChange }) => (
        <MediaPickerInput
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          allowUpload
          variant="preview"
        />
      ),
    },
    alt: { type: "text", label: "Alt text" },
    href: { type: "text", label: "Link target" },
    height: { type: "number", label: "Height (px)", min: 16, max: 200 },
    mobileImageUrl: {
      type: "custom",
      label: "Mobile logo (optional)",
      render: ({ value, onChange }) => (
        <MediaPickerInput
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          allowUpload
          variant="preview"
        />
      ),
    },
    mobileHeight: { type: "number", label: "Mobile height (px)", min: 16, max: 200 },
  },
  defaultProps: { imageUrl: "", alt: "Site logo", href: "/", height: 36, mobileImageUrl: "", mobileHeight: 28 },
  render: ({ imageUrl, alt, href, height, mobileImageUrl, mobileHeight, puck }) => {
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const effectiveUrl = imageUrl || md.themeLogoUrl || "";
    const effectiveMobileUrl = mobileImageUrl || effectiveUrl;
    const effectiveMobileHeight = mobileHeight ?? height;
    if (puck?.isEditing) {
      return <BuilderCard name="SiteLogo" title="Site Logo" description="Site logo image with link. Mobile fields swap the image / height below 768px." />;
    }
    if (!effectiveUrl) {
      return <></>;
    }
    const sameAtBothBreakpoints =
      effectiveMobileUrl === effectiveUrl && effectiveMobileHeight === height;
    return (
      <a href={href || "/"} className="np-site-logo not-prose inline-flex items-center">
        {sameAtBothBreakpoints ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={effectiveUrl} alt={alt} style={{ height: `${height}px`, width: "auto" }} />
        ) : (
          <>
            {/* Mobile: shown <md. Hidden via Tailwind responsive class. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveMobileUrl}
              alt={alt}
              className="inline md:hidden"
              style={{ height: `${effectiveMobileHeight}px`, width: "auto" }}
            />
            {/* Desktop: shown md+. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveUrl}
              alt={alt}
              className="hidden md:inline"
              style={{ height: `${height}px`, width: "auto" }}
            />
          </>
        )}
      </a>
    );
  },
};

export const SiteLogoBlock: Omit<RegisteredBlock, "source"> = {
  name: "SiteLogo",
  config: SiteLogo,
  // Header + footer + sidebar so editors can drop a Logo into any
  // chrome zone (or inside a Layout column on those surfaces) — same
  // surface coverage as the other Site-category brand blocks.
  surfaces: ["header", "footer", "sidebar"],
  category: "Template",
};
