/**
 * Admin-only editor fields for the Hero block.
 *
 * Imports `MediaPickerInput` + `ContentLinkInput` (media dialog + content-link
 * picker) and the inline hex-color pickers, and is imported ONLY by the admin
 * fields barrel — never the public render path. Hero.tsx registers with
 * `fields: {}`; `withAdminFields` re-attaches these for `<Puck>`.
 */
import type { ComponentConfig, CustomField } from "@measured/puck";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { registerBlockFields } from "@core/blocks/registry";
import { blockSelectField } from "@core/blocks/BlockSelect";
import type {
  HeroProps,
  HeroLayout,
  HeroOverlayColor,
  HeroTextColor,
  HeroCtaColor,
} from "./Hero";

const TEXT_COLOR_OPTIONS: { label: string; value: HeroTextColor }[] = [
  { label: "Auto (matches overlay)", value: "default" },
  { label: "Black", value: "black" },
  { label: "White", value: "white" },
  { label: "Brand navy", value: "navy" },
  { label: "Brand green", value: "green" },
  { label: "Brand light", value: "light" },
  { label: "Custom…", value: "custom" },
];

function HexField({
  value,
  onChange,
  defaultHex,
  ariaLabel,
}: {
  value: unknown;
  onChange: (next: string) => void;
  defaultHex: string;
  ariaLabel: string;
}) {
  const hex = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : defaultHex;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        aria-label={ariaLabel}
      />
      <input
        type="text"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
        placeholder={defaultHex}
      />
    </div>
  );
}

function renderHexField(defaultHex: string, ariaLabel: string): CustomField<string>["render"] {
  function HexFieldRender({ value, onChange }: { value: unknown; onChange: (next: string) => void }) {
    return (
      <HexField value={value} onChange={onChange} defaultHex={defaultHex} ariaLabel={ariaLabel} />
    );
  }
  return HexFieldRender;
}

const ALL_FIELDS = {
  layout: blockSelectField<HeroLayout>({
    label: "Layout",
    options: [
      { label: "Overlay (full-bleed image, text on top)", value: "overlay" },
      { label: "Side-by-side (image + text columns)", value: "side-by-side" },
    ],
  }),
  imagePosition: {
    type: "radio",
    label: "Image side",
    options: [
      { label: "Left", value: "left" },
      { label: "Right", value: "right" },
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
  imageUrl: {
    type: "custom",
    label: "Image",
    render: ({ value, onChange }) => (
      <MediaPickerInput
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        allowUpload
        variant="preview"
      />
    ),
  },
  imageAlt: {
    type: "text",
    label: "Image alt text",
  },
  overlayColor: blockSelectField<HeroOverlayColor>({
    label: "Image overlay",
    options: [
      { label: "None", value: "none" },
      { label: "Black", value: "black" },
      { label: "White", value: "white" },
      { label: "Brand navy", value: "navy" },
      { label: "Brand green", value: "green" },
      { label: "Brand light", value: "light" },
    ],
  }),
  headline: {
    type: "text",
    label: "Headline",
  },
  headlineWeight: {
    type: "radio",
    label: "Headline weight",
    options: [
      { label: "Bold", value: "bold" },
      { label: "Regular", value: "regular" },
    ],
  },
  headlineColorPreset: blockSelectField<HeroTextColor>({
    label: "Headline color",
    options: TEXT_COLOR_OPTIONS,
  }),
  headlineColorCustom: {
    type: "custom",
    label: "Headline custom color",
    render: renderHexField("#2A3A5B", "Pick custom headline color"),
  },
  subheadline: {
    type: "textarea",
    label: "Sub-headline",
  },
  subheadlineWeight: {
    type: "radio",
    label: "Sub-headline weight",
    options: [
      { label: "Bold", value: "bold" },
      { label: "Regular", value: "regular" },
    ],
  },
  subheadlineColorPreset: blockSelectField<HeroTextColor>({
    label: "Sub-headline color",
    options: TEXT_COLOR_OPTIONS,
  }),
  subheadlineColorCustom: {
    type: "custom",
    label: "Sub-headline custom color",
    render: renderHexField("#475569", "Pick custom sub-headline color"),
  },
  ctaText: {
    type: "text",
    label: "Button text",
  },
  ctaHref: {
    type: "custom",
    label: "Button link",
    render: ({ value, onChange }) => (
      <ContentLinkInput value={typeof value === "string" ? value : ""} onChange={onChange} />
    ),
  },
  ctaTarget: {
    type: "radio",
    label: "Link target",
    options: [
      { label: "Same tab", value: "_self" },
      { label: "New tab", value: "_blank" },
    ],
  },
  ctaColorPreset: blockSelectField<HeroCtaColor>({
    label: "Button color",
    options: [
      { label: "Primary (green)", value: "primary" },
      { label: "Navy", value: "navy" },
      { label: "White / outline", value: "white" },
      { label: "Light", value: "light" },
      { label: "Custom…", value: "custom" },
    ],
  }),
  ctaColorCustom: {
    type: "custom",
    label: "Button custom color",
    render: renderHexField("#2B944F", "Pick custom button color"),
  },
} as const satisfies ComponentConfig<HeroProps>["fields"];

registerBlockFields("Hero", ALL_FIELDS as ComponentConfig<HeroProps>["fields"]);
