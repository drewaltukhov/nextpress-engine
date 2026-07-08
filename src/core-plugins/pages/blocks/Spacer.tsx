import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

export type SpacerSize = "small" | "medium" | "large" | "xlarge" | "custom";

export type SpacerProps = {
  size: SpacerSize;
  /** Active only when `size === "custom"`. Stored as a rem number so
   *  the value travels cleanly across themes (px would tie spacing to
   *  one root font-size). */
  customRem: number;
};

const PRESET_REM: Record<Exclude<SpacerSize, "custom">, number> = {
  small: 1,
  medium: 2,
  large: 4,
  xlarge: 8,
};

const ALL_FIELDS = {
  size: blockSelectField<SpacerSize>({
    label: "Size",
    options: [
      { label: "Small · 1rem", value: "small" },
      { label: "Medium · 2rem", value: "medium" },
      { label: "Large · 4rem", value: "large" },
      { label: "X-Large · 8rem", value: "xlarge" },
      { label: "Custom…", value: "custom" },
    ],
  }),
  customRem: {
    type: "number",
    label: "Custom size (rem)",
    min: 0.25,
    max: 32,
    step: 0.25,
  },
} satisfies ComponentConfig<SpacerProps>["fields"];

function resolveRem(size: SpacerSize, customRem: number): number {
  if (size === "custom") {
    // Clamp to the same range the inspector enforces, in case the row
    // came in with a stale value from a saved page.
    if (!Number.isFinite(customRem) || customRem <= 0) return 1;
    return Math.min(32, Math.max(0.25, customRem));
  }
  return PRESET_REM[size] ?? PRESET_REM.medium;
}

export const Spacer: ComponentConfig<SpacerProps> = {
  label: "Spacer",
  fields: ALL_FIELDS,
  defaultProps: { size: "medium", customRem: 1 },
  // Hide the custom-rem input unless `size === "custom"`. The value stays
  // in puckData when the user flips back to a preset, so toggling between
  // presets and custom doesn't lose the previous custom value.
  resolveFields: (data, { fields }) => {
    if (data.props?.size === "custom") return fields;
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => key !== "customRem"),
    );
    return filtered as typeof fields;
  },
  render: ({ size, customRem, puck }) => {
    const rem = resolveRem(size, customRem);
    const formatted = Number.isInteger(rem) ? `${rem}rem` : `${rem.toFixed(2)}rem`;
    const heightStyle = `${rem}rem`;
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    if (puck?.isEditing && md.themeBuilder) {
      return <BuilderCard name="Spacer" title="Spacer" description={`${formatted} of vertical space.`} />;
    }
    if (puck?.isEditing) {
      // Page/post editor: render an outlined placeholder at the
      // configured height so the user can see (and click) the gap.
      return (
        <div
          className="not-prose flex items-center justify-center rounded text-[11px] text-slate-400"
          style={{ height: heightStyle, border: "1px dashed #cbd5e1" }}
        >
          Spacer · {formatted}
        </div>
      );
    }
    // Public mode: invisible whitespace. aria-hidden so screen readers
    // don't read out an empty element.
    return <div className="np-spacer not-prose" style={{ height: heightStyle }} aria-hidden />;
  },
};

export const SpacerBlock: Omit<RegisteredBlock, "source"> = {
  name: "Spacer",
  config: Spacer,
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
