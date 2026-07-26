/**
 * Admin-only editor fields for the Button block.
 *
 * Imports `ContentLinkInput` (the content-link picker) and is imported ONLY by
 * the admin fields barrel — never the public render path. Button.tsx registers
 * with `fields: {}`; `withAdminFields` re-attaches these for `<Puck>`.
 */
import type { ComponentConfig, CustomField } from "@measured/puck";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { registerBlockFields } from "@core/blocks/registry";
import { blockSelectField } from "@core/blocks/BlockSelect";
import type { ButtonColor, ButtonProps, ButtonSize } from "./Button";

const renderLinkField: CustomField<string>["render"] = function LinkFieldRender({
  value,
  onChange,
}) {
  return <ContentLinkInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
};

registerBlockFields("Button", {
  text: { type: "text", label: "Button text" },
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
  color: blockSelectField<ButtonColor>({
    label: "Button color",
    // Order: theme-tied first (so the brand identity is the default
    // reach), then a curated CTA palette. Swatch values use the same
    // CSS-var-with-fallback string as the rendered background, so the
    // dot in the picker matches what ends up on the page.
    options: [
      { label: "Primary accent (theme)", value: "theme-accent", swatch: "var(--np-accent, #00baa7)" },
      { label: "Heading dark (theme)", value: "theme-heading", swatch: "var(--np-heading, #27272a)" },
      { label: "Page surface (theme)", value: "theme-surface", swatch: "var(--np-surface, #fafafa)" },
      { label: "Emerald", value: "emerald", swatch: "#059669" },
      { label: "Blue", value: "blue", swatch: "#2563eb" },
      { label: "Indigo", value: "indigo", swatch: "#4f46e5" },
      { label: "Violet", value: "violet", swatch: "#7c3aed" },
      { label: "Rose", value: "rose", swatch: "#e11d48" },
      { label: "Amber", value: "amber", swatch: "#f59e0b" },
      { label: "Orange", value: "orange", swatch: "#ea580c" },
      { label: "Red", value: "red", swatch: "#dc2626" },
      { label: "Slate", value: "slate", swatch: "#0f172a" },
      { label: "Black", value: "black", swatch: "#000000" },
      { label: "White (outlined)", value: "white", swatch: "#ffffff" },
    ],
  }),
  size: blockSelectField<ButtonSize>({
    label: "Size",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  }),
  width: {
    type: "radio",
    label: "Width",
    options: [
      { label: "Auto (fits text)", value: "auto" },
      { label: "Full (fill container)", value: "full" },
    ],
  },
  align: {
    type: "radio",
    label: "Alignment",
    options: [
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
} as ComponentConfig<ButtonProps>["fields"]);
