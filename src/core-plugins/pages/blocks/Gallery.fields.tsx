/**
 * Admin-only editor fields for the Gallery block.
 *
 * Imports `GalleryPickerField` (which pulls the gallery-picker dialog) and is
 * imported ONLY by the admin fields barrel — never the public render path.
 * Gallery.tsx registers with `fields: {}`; `withAdminFields` re-attaches these
 * for `<Puck>`.
 */
import type { ComponentConfig } from "@measured/puck";
import type { GalleryLayout } from "@core-plugins/galleries/components/GalleryEmbed";
import { registerBlockFields } from "@core/blocks/registry";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { GalleryPickerField } from "./GalleryPickerField";
import type { GalleryBlockProps } from "./Gallery";

registerBlockFields("Gallery", {
  galleryId: {
    type: "custom",
    label: "Gallery",
    render: ({ value, onChange }) => (
      <GalleryPickerField value={typeof value === "number" ? value : null} onChange={onChange} />
    ),
  },
  layout: blockSelectField<GalleryLayout>({
    label: "Layout",
    options: [
      { label: "Grid + lightbox", value: "grid-lightbox" },
      { label: "Carousel", value: "carousel" },
      { label: "Masonry", value: "masonry" },
    ],
  }),
  columns: {
    type: "number",
    label: "Columns",
    min: 1,
    max: 12,
  },
  gap: {
    type: "number",
    label: "Gap between images (rem)",
    min: 0,
    max: 5,
    step: 0.5,
  },
  removeRadius: {
    type: "radio",
    label: "Remove rounded corners",
    options: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  showCaptions: {
    type: "radio",
    label: "Show captions",
    options: [
      { label: "Show", value: true },
      { label: "Hide", value: false },
    ],
  },
  showArrows: {
    type: "radio",
    label: "Carousel arrows",
    options: [
      { label: "Show", value: true },
      { label: "Hide", value: false },
    ],
  },
  showDots: {
    type: "radio",
    label: "Carousel dots",
    options: [
      { label: "Show", value: true },
      { label: "Hide", value: false },
    ],
  },
  enableLightbox: {
    type: "radio",
    label: "Enlarge on tap (lightbox)",
    options: [
      { label: "On", value: true },
      { label: "Off", value: false },
    ],
  },
} as ComponentConfig<GalleryBlockProps>["fields"]);
