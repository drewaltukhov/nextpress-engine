/**
 * Admin-only editor fields for the Image block.
 *
 * Imports `MediaPickerInput` (the media-library dialog) and is imported ONLY by
 * the admin fields barrel — never the public render path. Image.tsx registers
 * with `fields: {}`, so importing it for its server `render` pulls no picker
 * UI into public bundles; `withAdminFields` re-attaches these for `<Puck>`.
 */
import type { ComponentConfig, CustomField } from "@measured/puck";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { registerBlockFields } from "@core/blocks/registry";
import type { ImageProps } from "./Image";

const renderMediaField: CustomField<string>["render"] = function MediaFieldRender({
  value,
  onChange,
}) {
  // `variant="stacked"` puts the action buttons (Browse / Upload / Clear) on
  // the top row and the URL field full-width below — fits the narrow Puck
  // inspector column better than the default inline layout. `allowUpload`
  // enables the quick-upload button, so all three entry paths (paste URL, pick
  // from media, quick upload) are visible at once.
  return (
    <MediaPickerInput
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      allowUpload
      variant="stacked"
    />
  );
};

registerBlockFields("Image", {
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
} as ComponentConfig<ImageProps>["fields"]);
