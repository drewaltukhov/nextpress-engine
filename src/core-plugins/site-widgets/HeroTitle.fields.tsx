/**
 * Admin-only editor fields for the HeroTitle widget.
 *
 * Imports `MediaPickerInput` + the inline hex-color pickers, and is imported
 * ONLY by the site-widgets fields barrel — never the public render path.
 * HeroTitle.tsx registers with `fields: {}`; `withAdminFields` re-attaches
 * these for `<Puck>`.
 */
import type { ComponentConfig, CustomField } from "@measured/puck";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { registerBlockFields } from "@core/blocks/registry";
import { blockSelectField } from "@core/blocks/BlockSelect";
import type {
  HeroTitleProps,
  HeroTitleLevel,
  HeroTitleOverlayColor,
  HeroTitleTextColor,
} from "./HeroTitle";

const TEXT_COLOR_OPTIONS: { label: string; value: HeroTitleTextColor }[] = [
  { label: "Auto (matches background)", value: "auto" },
  { label: "White", value: "white" },
  { label: "Black", value: "black" },
  { label: "Dark blue", value: "navy" },
  { label: "Green", value: "green" },
  { label: "Mint", value: "light" },
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
  const hex =
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : defaultHex;
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

function renderHexField(
  defaultHex: string,
  ariaLabel: string,
): CustomField<string>["render"] {
  function HexFieldRender({
    value,
    onChange,
  }: {
    value: unknown;
    onChange: (next: string) => void;
  }) {
    return (
      <HexField
        value={value}
        onChange={onChange}
        defaultHex={defaultHex}
        ariaLabel={ariaLabel}
      />
    );
  }
  return HexFieldRender;
}

export const heroTitleFields = {
    imageUrl: {
      type: "custom",
      label: "Background image",
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
      label: "Background image alt text",
    },
    overlayColor: blockSelectField<HeroTitleOverlayColor>({
      label: "Image overlay",
      options: [
        { label: "None", value: "none" },
        { label: "Black", value: "black" },
        { label: "White", value: "white" },
        { label: "Dark blue", value: "navy" },
        { label: "Green", value: "green" },
        { label: "Mint", value: "light" },
      ],
    }),
    as: blockSelectField<HeroTitleLevel>({
      label: "Heading level",
      options: [
        { label: "H1", value: "h1" },
        { label: "H2", value: "h2" },
        { label: "H3", value: "h3" },
      ],
    }),
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
    showAuthor: {
      type: "radio",
      label: "Show author",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    linkAuthor: {
      type: "radio",
      label: "Link to author page",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    nameSource: {
      type: "radio",
      label: "Author name",
      options: [
        { label: "Username (display name)", value: "displayName" },
        { label: "Full / real name", value: "fullName" },
      ],
    },
    showAvatar: {
      type: "radio",
      label: "Show avatar",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    avatarSizeRem: {
      type: "number",
      label: "Avatar size (rem)",
      min: 1,
      max: 16,
      step: 0.5,
    },
    avatarShape: {
      type: "radio",
      label: "Avatar shape",
      options: [
        { label: "Original", value: "original" },
        { label: "Circle", value: "circle" },
      ],
    },
    showDate: {
      type: "radio",
      label: "Show date",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    titleColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Title color",
      options: TEXT_COLOR_OPTIONS,
    }),
    titleColorCustom: {
      type: "custom",
      label: "Title custom color",
      render: renderHexField("#FFFFFF", "Pick custom title color"),
    },
    authorColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Author color",
      options: TEXT_COLOR_OPTIONS,
    }),
    authorColorCustom: {
      type: "custom",
      label: "Author custom color",
      render: renderHexField("#FFFFFF", "Pick custom author color"),
    },
    dateColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Date color",
      options: TEXT_COLOR_OPTIONS,
    }),
    dateColorCustom: {
      type: "custom",
      label: "Date custom color",
      render: renderHexField("#FFFFFF", "Pick custom date color"),
    },
    rounded: {
      type: "radio",
      label: "Round corners",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    paddingYRem: {
      type: "number",
      label: "Vertical padding (rem)",
      min: 0,
      max: 16,
      step: 0.5,
    },
} as ComponentConfig<HeroTitleProps>["fields"];

registerBlockFields("HeroTitle", heroTitleFields);
