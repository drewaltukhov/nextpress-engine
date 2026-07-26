/**
 * Admin-only editor fields for the Banner block.
 *
 * Imports `MediaPickerInput` + `ContentLinkInput` (media dialog + content-link
 * picker) and is imported ONLY by the admin fields barrel — never the public
 * render path. Banner.tsx registers with `fields: {}`; `withAdminFields`
 * re-attaches these for `<Puck>`.
 */
import type { ComponentConfig, CustomField } from "@measured/puck";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { registerBlockFields } from "@core/blocks/registry";
import type { BannerProps } from "./Banner";

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

registerBlockFields("Banner", {
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
} as ComponentConfig<BannerProps>["fields"]);
