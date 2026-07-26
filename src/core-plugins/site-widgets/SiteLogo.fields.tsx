/**
 * Admin-only editor fields for the SiteLogo widget.
 *
 * Imports `MediaPickerInput` and is imported ONLY by the site-widgets fields
 * barrel — never the public render path. SiteLogo.tsx registers with
 * `fields: {}`; `withAdminFields` re-attaches these for `<Puck>`.
 */
import type { ComponentConfig } from "@measured/puck";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { registerBlockFields } from "@core/blocks/registry";
import type { SiteLogoProps } from "./SiteLogo";

registerBlockFields("SiteLogo", {
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
} as ComponentConfig<SiteLogoProps>["fields"]);
