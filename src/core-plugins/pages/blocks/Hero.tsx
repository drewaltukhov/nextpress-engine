import type { ComponentConfig } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BlockPlaceholder } from "./_placeholder";
import { BuilderCard } from "@core/blocks/BuilderCard";

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

export const Hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  // Editor fields (MediaPicker + ContentLink + hex pickers) live in
  // Hero.fields.tsx and merge in for the admin editor via `withAdminFields`.
  // Empty here so the public render path never pulls the picker UI.
  fields: {} as ComponentConfig<HeroProps>["fields"],
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
