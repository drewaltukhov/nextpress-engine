import type { ComponentConfig, CustomField } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { BlockPlaceholder } from "./_placeholder";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

export type HeroLayout = "overlay" | "side-by-side";
export type HeroImagePosition = "left" | "right";
export type HeroAlign = "left" | "center" | "right";
export type HeroOverlayColor = "none" | "black" | "white" | "navy" | "green" | "light";
export type HeroTextColor = "default" | "black" | "white" | "navy" | "green" | "light" | "custom";
export type HeroFontWeight = "bold" | "regular";
export type HeroCtaColor = "primary" | "navy" | "white" | "light" | "custom";
export type HeroCtaTarget = "_self" | "_blank";

export type HeroProps = {
  layout: HeroLayout;
  /** Side-by-side only — which side the image sits on. Persisted across
   *  layout flips so toggling back restores the user's prior choice. */
  imagePosition: HeroImagePosition;
  /** Horizontal alignment for headline, sub-headline, and CTA. */
  align: HeroAlign;
  imageUrl: string;
  imageAlt: string;
  /** Overlay-only — color tint laid over the image so text reads. "none"
   *  disables the overlay entirely. Persisted across layout flips. */
  overlayColor: HeroOverlayColor;
  headline: string;
  subheadline: string;
  headlineWeight: HeroFontWeight;
  subheadlineWeight: HeroFontWeight;
  /** Headline color. "default" auto-picks a sensible color based on layout
   *  and overlay; "custom" reads from headlineColorCustom. */
  headlineColorPreset: HeroTextColor;
  headlineColorCustom: string;
  subheadlineColorPreset: HeroTextColor;
  subheadlineColorCustom: string;
  ctaText: string;
  /** Free-text URL or "/<slug>" / "/<pillar>/<spike>" from the picker. */
  ctaHref: string;
  ctaTarget: HeroCtaTarget;
  ctaColorPreset: HeroCtaColor;
  /** Hex color used only when ctaColorPreset === "custom". Persisted so
   *  flipping back to "custom" restores the user's prior pick. */
  ctaColorCustom: string;
};

const PRESET_BTN: Record<Exclude<HeroCtaColor, "custom">, string> = {
  primary: "bg-brand-green text-white hover:bg-brand-green/90",
  navy: "bg-brand-navy text-white hover:bg-brand-navy/90",
  white: "bg-white text-brand-navy border border-brand-navy hover:bg-slate-50",
  light: "bg-brand-light-green text-brand-navy hover:bg-brand-light-green/70",
};

// `w-fit` prevents the button from stretching when its flex-column parent
// has `align-items: stretch` (e.g. older Hero data saved before `align`
// existed), which would otherwise expand the button to the full column width.
const BTN_BASE =
  "inline-flex w-fit items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors no-underline";

// Tailwind purges classes by literal string match, so each class string
// has to appear in source as-is. Lookup tables instead of template
// concatenation keep them all visible to the scanner.
const ALIGN_ITEMS: Record<HeroAlign, string> = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};

const ALIGN_TEXT: Record<HeroAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const OVERLAY_BG: Record<Exclude<HeroOverlayColor, "none">, string> = {
  black: "bg-black/45",
  white: "bg-white/55",
  navy: "bg-brand-navy/55",
  green: "bg-brand-green/55",
  light: "bg-brand-light-green/70",
};

// Whether the chosen overlay reads as "dark" (white text on top) vs "light"
// (brand-navy text on top). "none" is treated as dark so default white
// text still shows over a typical dark photograph.
const OVERLAY_IS_DARK: Record<HeroOverlayColor, boolean> = {
  none: true,
  black: true,
  navy: true,
  green: true,
  white: false,
  light: false,
};

const FONT_WEIGHT: Record<HeroFontWeight, string> = {
  bold: "font-bold",
  regular: "font-normal",
};

const PRESET_TEXT_COLOR: Record<Exclude<HeroTextColor, "default" | "custom">, string> = {
  black: "text-black",
  white: "text-white",
  navy: "text-brand-navy",
  green: "text-brand-green",
  light: "text-brand-light-green",
};

const TEXT_COLOR_OPTIONS: { label: string; value: HeroTextColor }[] = [
  { label: "Auto (matches overlay)", value: "default" },
  { label: "Black", value: "black" },
  { label: "White", value: "white" },
  { label: "Brand navy", value: "navy" },
  { label: "Brand green", value: "green" },
  { label: "Brand light", value: "light" },
  { label: "Custom…", value: "custom" },
];

interface ResolvedColor {
  className: string;
  style?: CSSProperties;
}

function resolveTextColor(
  preset: HeroTextColor | undefined,
  customHex: string | undefined,
  fallbackClass: string,
): ResolvedColor {
  const safe = preset ?? "default";
  if (safe === "custom") {
    const hex = typeof customHex === "string" && /^#[0-9a-fA-F]{6}$/.test(customHex)
      ? customHex
      : "#000000";
    return { className: "", style: { color: hex } };
  }
  if (safe === "default") return { className: fallbackClass };
  return { className: PRESET_TEXT_COLOR[safe] };
}

// Inline custom-hex picker reused by the headline, sub-headline, and CTA
// color fields. Standalone component so the lint rule about anonymous
// component renders stays satisfied — Puck's `render` callback wraps it.
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

export const Hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  fields: ALL_FIELDS,
  defaultProps: {
    layout: "overlay",
    imagePosition: "right",
    align: "center",
    imageUrl: "",
    imageAlt: "",
    overlayColor: "black",
    headline: "Your headline here",
    subheadline: "Add a supporting line that sets the tone.",
    headlineWeight: "bold",
    subheadlineWeight: "regular",
    headlineColorPreset: "default",
    headlineColorCustom: "#2A3A5B",
    subheadlineColorPreset: "default",
    subheadlineColorCustom: "#475569",
    ctaText: "",
    ctaHref: "",
    ctaTarget: "_self",
    ctaColorPreset: "primary",
    ctaColorCustom: "#2B944F",
  },
  // Hide layout-specific and color-specific fields when they don't apply.
  // Values stay in puckData so flipping the toggle back restores the prior
  // pick — same pattern as Gallery's carousel-only field hiding.
  resolveFields: (data, { fields }) => {
    const layout = data.props?.layout ?? "overlay";
    const headlinePreset = data.props?.headlineColorPreset ?? "default";
    const subheadlinePreset = data.props?.subheadlineColorPreset ?? "default";
    const ctaPreset = data.props?.ctaColorPreset ?? "primary";
    const hide: Array<keyof HeroProps> = [];
    if (layout !== "side-by-side") hide.push("imagePosition");
    if (layout !== "overlay") hide.push("overlayColor");
    if (headlinePreset !== "custom") hide.push("headlineColorCustom");
    if (subheadlinePreset !== "custom") hide.push("subheadlineColorCustom");
    if (ctaPreset !== "custom") hide.push("ctaColorCustom");
    if (hide.length === 0) return fields;
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => !hide.includes(key as keyof HeroProps)),
    );
    return filtered as typeof fields;
  },
  render: ({
    layout,
    imagePosition,
    align,
    imageUrl,
    imageAlt,
    overlayColor,
    headline,
    subheadline,
    headlineWeight,
    subheadlineWeight,
    headlineColorPreset,
    headlineColorCustom,
    subheadlineColorPreset,
    subheadlineColorCustom,
    ctaText,
    ctaHref,
    ctaTarget,
    ctaColorPreset,
    ctaColorCustom,
    puck,
  }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    const hasImage = imageUrl.length > 0;
    const hasHeadline = headline.trim().length > 0;
    if (puck?.isEditing && md.themeBuilder) {
      const description = hasHeadline
        ? `${layout} · "${headline}"`
        : `${layout} · pick an image and set the headline in the inspector.`;
      return <BuilderCard name="Hero" title="Hero" description={description} />;
    }
    if (!hasImage && !hasHeadline) {
      return (
        <BlockPlaceholder>
          Hero — pick an image and set the headline in the Widget Settings panel
        </BlockPlaceholder>
      );
    }

    const showCta = ctaText.trim().length > 0 && ctaHref.trim().length > 0;
    const isExternal = /^https?:\/\//i.test(ctaHref);
    const rel = ctaTarget === "_blank" ? "noopener noreferrer" : isExternal ? "noopener" : undefined;

    const ctaClass =
      ctaColorPreset === "custom"
        ? `${BTN_BASE} text-white hover:opacity-90`
        : `${BTN_BASE} ${PRESET_BTN[ctaColorPreset]}`;
    const ctaStyle =
      ctaColorPreset === "custom"
        ? ({ backgroundColor: ctaColorCustom } as const)
        : undefined;

    // Defaults guard against Hero blocks saved before these fields existed
    // (puckData persists raw props; new keys arrive as undefined). Defaults
    // here mirror `defaultProps` so old data renders identically to fresh.
    const safeAlign: HeroAlign = align ?? "center";
    const safeOverlay: HeroOverlayColor = overlayColor ?? "black";
    const alignItems = ALIGN_ITEMS[safeAlign];
    const alignText = ALIGN_TEXT[safeAlign];
    const headlineWeightClass = FONT_WEIGHT[headlineWeight ?? "bold"];
    const subheadlineWeightClass = FONT_WEIGHT[subheadlineWeight ?? "regular"];

    if (layout === "overlay") {
      const overlayDark = OVERLAY_IS_DARK[safeOverlay];
      const autoHeadlineClass = hasImage
        ? overlayDark
          ? "text-white"
          : "text-brand-navy"
        : "text-brand-navy";
      const autoSubClass = hasImage
        ? overlayDark
          ? "text-white/90"
          : "text-brand-navy/80"
        : "text-slate-600";
      const headlineColor = resolveTextColor(
        headlineColorPreset,
        headlineColorCustom,
        autoHeadlineClass,
      );
      const subheadlineColor = resolveTextColor(
        subheadlineColorPreset,
        subheadlineColorCustom,
        autoSubClass,
      );

      return (
        <section className="np-hero not-prose relative mb-4 overflow-hidden bg-slate-100">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt}
              className="absolute inset-0 m-0 h-full w-full object-cover object-center"
            />
          ) : null}
          {hasImage && safeOverlay !== "none" ? (
            <div
              className={`absolute inset-0 ${OVERLAY_BG[safeOverlay]}`}
              aria-hidden="true"
            />
          ) : null}
          <div
            className={`relative z-10 flex min-h-[420px] flex-col justify-center gap-4 p-8 md:p-12 ${alignItems} ${alignText}`}
          >
            {hasHeadline ? (
              <h2
                className={`max-w-3xl text-3xl leading-tight md:text-5xl ${headlineWeightClass} ${headlineColor.className}`}
                style={headlineColor.style}
              >
                {headline}
              </h2>
            ) : null}
            {subheadline.trim().length > 0 ? (
              <h3
                className={`max-w-2xl text-base md:text-lg ${subheadlineWeightClass} ${subheadlineColor.className}`}
                style={subheadlineColor.style}
              >
                {subheadline}
              </h3>
            ) : null}
            {showCta ? (
              <a
                href={ctaHref}
                target={ctaTarget}
                rel={rel}
                className={ctaClass}
                style={ctaStyle}
              >
                {ctaText}
              </a>
            ) : null}
          </div>
        </section>
      );
    }

    // side-by-side
    const imageFirst = imagePosition === "left";
    const headlineColor = resolveTextColor(
      headlineColorPreset,
      headlineColorCustom,
      "text-brand-navy",
    );
    const subheadlineColor = resolveTextColor(
      subheadlineColorPreset,
      subheadlineColorCustom,
      "text-slate-600",
    );

    return (
      <section className="np-hero not-prose mb-4 grid items-center gap-8 md:grid-cols-2">
        <div className={imageFirst ? "md:order-1" : "md:order-2"}>
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt}
              className="m-0 w-full object-cover object-center"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
              No image
            </div>
          )}
        </div>
        <div
          className={`flex flex-col gap-4 ${alignItems} ${alignText} ${
            imageFirst ? "md:order-2" : "md:order-1"
          }`}
        >
          {hasHeadline ? (
            <h2
              className={`text-3xl leading-tight md:text-4xl ${headlineWeightClass} ${headlineColor.className}`}
              style={headlineColor.style}
            >
              {headline}
            </h2>
          ) : null}
          {subheadline.trim().length > 0 ? (
            <h3
              className={`text-base md:text-lg ${subheadlineWeightClass} ${subheadlineColor.className}`}
              style={subheadlineColor.style}
            >
              {subheadline}
            </h3>
          ) : null}
          {showCta ? (
            <a
              href={ctaHref}
              target={ctaTarget}
              rel={rel}
              className={ctaClass}
              style={ctaStyle}
            >
              {ctaText}
            </a>
          ) : null}
        </div>
      </section>
    );
  },
};

export const HeroBlock: Omit<RegisteredBlock, "source"> = {
  name: "Hero",
  config: Hero,
  surfaces: [
    "page-content",
    "template-homepage",
    "template-single-page",
    "template-not-found",
    "template-author",
  ],
  category: "Sections",
};
