import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { HexField } from "./HexField";

export type SeparatorColorPreset =
  | "brand-navy"
  | "brand-green"
  | "brand-light-green"
  | "slate-200"
  | "slate-300"
  | "slate-400"
  | "custom";

export type SeparatorProps = {
  colorPreset: SeparatorColorPreset;
  /** Active only when `colorPreset === "custom"`. Hex string like "#cbd5e1". */
  colorCustom: string;
  /** Line thickness in pixels. Default 1. */
  thicknessPx: number;
};

export const SEPARATOR_PRESET_HEX: Record<Exclude<SeparatorColorPreset, "custom">, string> = {
  "brand-navy": "#2A3A5B",
  "brand-green": "#2B944F",
  "brand-light-green": "#E3EDE4",
  "slate-200": "#e2e8f0",
  "slate-300": "#cbd5e1",
  "slate-400": "#94a3b8",
};

export const SEPARATOR_COLOR_OPTIONS: { label: string; value: SeparatorColorPreset }[] = [
  { label: "Slate · light (slate-200)", value: "slate-200" },
  { label: "Slate · medium (slate-300)", value: "slate-300" },
  { label: "Slate · dark (slate-400)", value: "slate-400" },
  { label: "Brand · navy", value: "brand-navy" },
  { label: "Brand · green", value: "brand-green" },
  { label: "Brand · light green", value: "brand-light-green" },
  { label: "Custom hex…", value: "custom" },
];

/** Same resolution rule the Separator block uses — exported so other
 *  widgets that reuse the color picker pick the identical hex. */
export function resolveSeparatorColor(preset: SeparatorColorPreset, custom: string): string {
  if (preset === "custom") {
    return /^#[0-9a-fA-F]{6}$/.test(custom) ? custom : SEPARATOR_PRESET_HEX["slate-300"];
  }
  return SEPARATOR_PRESET_HEX[preset] ?? SEPARATOR_PRESET_HEX["slate-300"];
}

export const renderSeparatorHexField: CustomField<string>["render"] = function HexFieldRender({
  value,
  onChange,
}) {
  return <HexField value={value} onChange={onChange} />;
};

const ALL_FIELDS = {
  colorPreset: blockSelectField<SeparatorColorPreset>({
    label: "Color",
    options: SEPARATOR_COLOR_OPTIONS,
  }),
  colorCustom: {
    type: "custom",
    label: "Custom color",
    render: renderSeparatorHexField,
  },
  thicknessPx: {
    type: "number",
    label: "Thickness (px)",
    min: 1,
    max: 20,
    step: 1,
  },
} as const satisfies ComponentConfig<SeparatorProps>["fields"];

function resolveThickness(thicknessPx: number): number {
  if (!Number.isFinite(thicknessPx) || thicknessPx <= 0) return 1;
  return Math.min(20, Math.max(1, Math.round(thicknessPx)));
}

export const Separator: ComponentConfig<SeparatorProps> = {
  label: "Separator",
  fields: ALL_FIELDS,
  defaultProps: {
    colorPreset: "slate-300",
    colorCustom: "#cbd5e1",
    thicknessPx: 1,
  },
  // Hide custom-hex unless preset === "custom". The value stays in puckData
  // so flipping back to "custom" restores the prior pick.
  resolveFields: (data, { fields }) => {
    if (data.props?.colorPreset === "custom") return fields;
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => key !== "colorCustom"),
    );
    return filtered as typeof fields;
  },
  render: ({ colorPreset, colorCustom, thicknessPx, puck }) => {
    const color = resolveSeparatorColor(colorPreset, colorCustom);
    const px = resolveThickness(thicknessPx);
    const height = `${px}px`;
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    if (puck?.isEditing && md.themeBuilder) {
      const colorLabel = colorPreset === "custom" ? color : colorPreset;
      return (
        <BuilderCard name="Separator" title="Separator" description={`${px}px · ${colorLabel}`}>
          <div className="w-full" style={{ height, backgroundColor: color }} aria-hidden />
        </BuilderCard>
      );
    }
    // Page/post editor + public: render the actual line. <hr> with
    // border-0 + explicit height/background gives a precise pixel-
    // perfect line that ignores user-agent <hr> defaults and the
    // typography plugin.
    return (
      <hr
        className="np-separator not-prose mb-4 w-full border-0"
        style={{ height, backgroundColor: color }}
        aria-hidden
      />
    );
  },
};

export const SeparatorBlock: Omit<RegisteredBlock, "source"> = {
  name: "Separator",
  config: Separator,
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
  category: "Layout",
};
