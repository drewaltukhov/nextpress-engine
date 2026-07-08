import type { ComponentConfig, CustomField } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { ContentLinkInput } from "@core/components/ContentLinkInput";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

/**
 * Button color tokens.
 *
 * Three groups:
 *   - "theme-*" — pull from the active theme's brand identity settings
 *     (`brand_primary` → --np-accent, `brand_navy` → --np-heading,
 *     `brand_light_green` → --np-surface). On admin pages where the
 *     theme stylesheet isn't loaded, the CSS-var fallback paints the
 *     swatch/background with each setting's default value, so the
 *     editor preview still looks right.
 *   - Curated CTA presets backed by Tailwind 6xx-shade hex tokens.
 *     The lookup keeps the full class strings as literals so Tailwind
 *     content-scanning picks them up.
 *   - Legacy `brand-green` / `brand-navy` / `brand-light-green` — kept
 *     so older puckData renders without surprise. Excluded from the
 *     picker so new buttons reach for the theme-tied / preset options
 *     instead.
 */
export type ButtonColor =
  | "theme-accent"
  | "theme-heading"
  | "theme-surface"
  | "emerald"
  | "blue"
  | "indigo"
  | "violet"
  | "rose"
  | "amber"
  | "orange"
  | "red"
  | "slate"
  | "black"
  | "white"
  // Legacy — predates the brand-identity rename. Render path keeps them
  // working; picker hides them.
  | "brand-green"
  | "brand-navy"
  | "brand-light-green";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonTarget = "_self" | "_blank";
export type ButtonWidth = "auto" | "full";
export type ButtonAlign = "left" | "center" | "right";

export type ButtonProps = {
  text: string;
  /** Free-text URL or `/<slug>` / `/<pillar>/<spike>` / `/topics/<slug>`
   *  picked via the content dialog. Empty string renders nothing. */
  href: string;
  target: ButtonTarget;
  color: ButtonColor;
  size: ButtonSize;
  /** "auto" keeps the button as wide as its label + padding (the
   *  default). "full" stretches it to fill its container, which only
   *  matters when paired with `align: "left" | "center" | "right"`
   *  becomes irrelevant — the row wrapper is `block` instead of
   *  `flex-justify`. */
  width: ButtonWidth;
  /** Horizontal placement when `width === "auto"`. Ignored for full-
   *  width because there's no slack to distribute. */
  align: ButtonAlign;
};

const renderLinkField: CustomField<string>["render"] = function LinkFieldRender({
  value,
  onChange,
}) {
  return <ContentLinkInput value={typeof value === "string" ? value : ""} onChange={onChange} />;
};

interface ColorSpec {
  /** Tailwind classes for background + text + hover. Required. */
  className: string;
  /** Inline style overrides — used by the theme-tied options to pull
   *  from CSS vars defined by the active theme. Undefined for fixed
   *  presets that don't need to react to theme settings. */
  style?: CSSProperties;
}

// Tailwind purge needs each background / hover variant to appear as
// a literal string in source. Lookup tables keep them visible to the
// scanner.
const COLOR_TABLE: Record<ButtonColor, ColorSpec> = {
  // Theme-tied — track the brand identity settings via CSS vars.
  // Fallbacks match the registered defaults in themes/nextpresso/index.tsx
  // so the editor preview still paints the expected color when the
  // theme stylesheet isn't loaded.
  "theme-accent": {
    className: "text-white hover:opacity-90",
    style: { backgroundColor: "var(--np-accent, #00baa7)" },
  },
  "theme-heading": {
    className: "text-white hover:opacity-90",
    style: { backgroundColor: "var(--np-heading, #27272a)" },
  },
  "theme-surface": {
    className: "hover:opacity-90 border border-slate-200",
    style: {
      backgroundColor: "var(--np-surface, #fafafa)",
      color: "var(--np-heading, #27272a)",
    },
  },
  // Curated CTA presets.
  emerald: { className: "bg-emerald-600 text-white hover:bg-emerald-700" },
  blue: { className: "bg-blue-600 text-white hover:bg-blue-700" },
  indigo: { className: "bg-indigo-600 text-white hover:bg-indigo-700" },
  violet: { className: "bg-violet-600 text-white hover:bg-violet-700" },
  rose: { className: "bg-rose-600 text-white hover:bg-rose-700" },
  amber: { className: "bg-amber-500 text-white hover:bg-amber-600" },
  orange: { className: "bg-orange-600 text-white hover:bg-orange-700" },
  red: { className: "bg-red-600 text-white hover:bg-red-700" },
  slate: { className: "bg-slate-900 text-white hover:bg-slate-700" },
  black: { className: "bg-black text-white hover:opacity-90" },
  white: {
    className: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
  },
  // Legacy — render path only, not exposed in the picker.
  "brand-green": { className: "bg-brand-green text-white hover:bg-brand-green/90" },
  "brand-navy": { className: "bg-brand-navy text-white hover:bg-brand-navy/90" },
  "brand-light-green": {
    className: "bg-brand-light-green text-brand-navy hover:bg-brand-light-green/80",
  },
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

// Wrapper variants, controlling horizontal placement of the button.
// Full-width uses `block` so the anchor's own `w-full` stretches edge
// to edge; auto-width uses `flex` with a justify-* token to position
// the inline-flex anchor.
const ALIGN_CLASS: Record<ButtonAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

const ALL_FIELDS = {
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
} as const satisfies ComponentConfig<ButtonProps>["fields"];

export const Button: ComponentConfig<ButtonProps> = {
  label: "Button",
  fields: ALL_FIELDS,
  defaultProps: {
    text: "Get started",
    href: "",
    target: "_self",
    color: "theme-accent",
    size: "md",
    width: "auto",
    align: "left",
  },
  // Hide alignment when width is full — the button stretches edge to
  // edge, so there's no slack to position. Value persists in puckData
  // so flipping back to auto restores the user's prior choice.
  resolveFields: (data, { fields }) => {
    if (data.props?.width !== "full") return fields;
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => key !== "align"),
    );
    return filtered as typeof fields;
  },
  render: ({ text, href, target, color, size, width, align, puck }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    if (puck?.isEditing && md.themeBuilder) {
      const widthDesc = width === "full" ? "full-width" : `${align}-aligned`;
      const desc = href
        ? `${text || "(no text)"} → ${href} · ${color} · ${size} · ${widthDesc}`
        : "Call-to-action button — set text + link URL in the inspector.";
      return <BuilderCard name="Button" title="Button" description={desc} />;
    }
    if (!text || !href) {
      // Editor preview: still render a faint outlined box so the
      // block has visible mass on the canvas. Public renders nothing.
      if (puck?.isEditing) {
        return (
          <span
            style={
              {
                display: "inline-block",
                padding: "0.5rem 1rem",
                border: "1px dashed #cbd5e1",
                color: "#94a3b8",
                fontSize: "0.875rem",
                borderRadius: "0.5rem",
              } satisfies CSSProperties
            }
          >
            Button — set text + URL in the inspector
          </span>
        );
      }
      return <></>;
    }
    // Anchor itself is `flex` rather than `inline-flex` only when the
    // width is full — keeps content centered inside the stretched
    // background. Otherwise it stays inline-flex so its width matches
    // its label + padding.
    // Fall back to the theme-accent spec when an unknown color token
    // sneaks through (legacy saves get the data through COLOR_TABLE;
    // future-removed keys still render rather than crashing).
    const colorSpec = COLOR_TABLE[color] ?? COLOR_TABLE["theme-accent"];
    const anchorClass = `not-prose ${
      width === "full" ? "flex w-full" : "inline-flex"
    } items-center justify-center rounded-lg font-medium transition ${SIZE_CLASS[size]} ${colorSpec.className}`;
    const anchor = (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        className={anchorClass}
        style={colorSpec.style}
      >
        {text}
      </a>
    );
    // Wrapper handles horizontal placement for auto width. Full-width
    // buttons skip the flex wrapper but still need `w-full` on the
    // wrapper itself — otherwise inside a flex container with
    // `items-start` / `items-center` / `items-end` (e.g. a Layout column),
    // the wrapper sizes to its content and the inner anchor's `w-full`
    // resolves against that, so the button never actually stretches.
    if (width === "full") {
      return <div className="np-button not-prose w-full">{anchor}</div>;
    }
    return (
      <div className={`np-button not-prose flex ${ALIGN_CLASS[align]}`}>{anchor}</div>
    );
  },
};

export const ButtonBlock: Omit<RegisteredBlock, "source"> = {
  name: "Button",
  config: Button,
  // Same broad surface coverage as the existing Banner block — useful
  // anywhere the user might want a CTA: page / post bodies, sidebars,
  // every theme template, footer.
  surfaces: [
    "page-content",
    "post-content",
    "sidebar",
    "footer",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-search-results",
    "template-author",
    "template-not-found",
  ],
  category: "Sections",
};
