import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";
import { registerThemeDefaults } from "@core-plugins/themes";
import { THEME_DEFAULTS } from "./defaults";
// Side-effect import: pulls the engine-level site widgets into the
// registry on plugin load, so server-side `renderActiveTheme` has every
// block resolvable when the active theme renders.
import "@core-plugins/site-widgets";

/**
 * NextPresso — the NextPress default theme.
 *
 * Typography-forward, light-only. Visual identity is borrowed from
 * Tailwind Plus "Spotlight" (zinc palette, tight tracking on bold
 * headings, teal-500 link accent, hairline rings instead of borders,
 * system sans for speed) — design language only, no code copied.
 *
 * Default Puck data for parts + templates is seeded via
 * `migrations/001_seed_defaults.sql` so the builder shows a working
 * layout the first time it loads.
 */

const SLUG = "nextpresso" as const;
const BRAND_GROUP = `theme.${SLUG}.brand`;
const HEADER_GROUP = `theme.${SLUG}.header`;
const BODY_GROUP = `theme.${SLUG}.body`;
const FOOTER_GROUP = `theme.${SLUG}.footer`;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const HEX_OR_EMPTY_RE = /^(#[0-9a-fA-F]{6})?$/;

export default function register(_api: PluginAPI): void {
  registerThemeDefaults(SLUG, THEME_DEFAULTS);

  defineSettings([
    {
      key: `theme.${SLUG}.logo_media_id`,
      group: BRAND_GROUP,
      label: "Logo image",
      description:
        "The site logo. Shown by SiteHeader and SiteLogo across every template — there is no per-instance override.",
      schema: z.string(),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.default_og_image_media_id`,
      group: BRAND_GROUP,
      label: "Default social image",
      description:
        "Fallback for og:image / twitter card when the homepage, a post, or a page has no featured image of its own. Pick from the Media library — a 1200×630 image is ideal for Facebook/LinkedIn link previews.",
      schema: z.string(),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.favicon_data`,
      group: BRAND_GROUP,
      label: "Favicon",
      description:
        "PNG, ICO, or SVG file shown in the browser tab. Stored separately from the Media library and overwritten on each upload.",
      schema: z.string().regex(
        /^(data:image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[A-Za-z0-9+/=]+)?$/,
        "Must be empty or a base64 data URL of an image (png/ico/svg)",
      ),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.brand_primary`,
      group: BRAND_GROUP,
      label: "Primary accent color",
      description:
        "Drives link hover and the active-state accent. CSS variable --np-accent.",
      schema: z.string().regex(HEX_COLOR_RE, "Hex color, e.g. #00baa7"),
      defaultValue: "#00baa7",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.brand_navy`,
      group: BRAND_GROUP,
      label: "Heading / dark color",
      description:
        "Used for headings and high-contrast text on light surfaces. CSS variable --np-heading.",
      schema: z.string().regex(HEX_COLOR_RE, "Hex color, e.g. #27272a"),
      defaultValue: "#27272a",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.brand_light_green`,
      group: BRAND_GROUP,
      label: "Page surface color",
      description:
        "The off-white the page sits on (cards float above this with bg-white). CSS variable --np-surface.",
      schema: z.string().regex(HEX_COLOR_RE, "Hex color, e.g. #fafafa"),
      defaultValue: "#fafafa",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.header_bg_color`,
      group: HEADER_GROUP,
      label: "Header background color",
      description:
        "Painted behind the header content (inside the container width). Leave empty to keep the header transparent.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.header_edges_color`,
      group: HEADER_GROUP,
      label: "Header edges color",
      description:
        "Painted on the full-bleed band outside the header container. Visible when the container width is set to a Tailwind preset or a custom width narrower than the viewport. Leave empty to keep the edges transparent.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.header_sticky`,
      group: HEADER_GROUP,
      label: "Sticky header on desktop",
      description:
        "Pin the header to the top of the viewport on screens 768px and wider once the page scrolls past it. Singleton — applies across every template.",
      schema: z.boolean(),
      defaultValue: false,
      scope: "public",
    },
    {
      key: `theme.${SLUG}.header_sticky_mobile`,
      group: HEADER_GROUP,
      label: "Sticky header on mobile",
      description:
        "Pin the header to the top of the viewport on screens below 768px once the page scrolls past it. Independent of the desktop setting.",
      schema: z.boolean(),
      defaultValue: false,
      scope: "public",
    },
    {
      key: `theme.${SLUG}.header_shadow`,
      group: HEADER_GROUP,
      label: "Header shadow",
      description:
        "Drop shadow under the header. Reads best on sticky headers but applies regardless.",
      schema: z.enum(["none", "sm", "md", "lg", "xl"]),
      defaultValue: "none",
      scope: "public",
      optionLabels: {
        none: "None",
        sm: "Small",
        md: "Medium",
        lg: "Large",
        xl: "Extra large",
      },
    },
    {
      key: `theme.${SLUG}.body_bg_color`,
      group: BODY_GROUP,
      label: "Body background color",
      description:
        "Painted behind the template body (inside the container width). Sits between the header and footer across every template. Leave empty for the page's native background.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.body_edges_color`,
      group: BODY_GROUP,
      label: "Body edges color",
      description:
        "Painted on the full-bleed band outside the body container. Visible when the container width is narrower than the viewport. Leave empty to keep the edges transparent.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.footer_bg_color`,
      group: FOOTER_GROUP,
      label: "Footer background color",
      description:
        "Painted behind the footer content (inside the container width). Leave empty to keep the footer transparent.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
    {
      key: `theme.${SLUG}.footer_edges_color`,
      group: FOOTER_GROUP,
      label: "Footer edges color",
      description:
        "Painted on the full-bleed band outside the footer container. Visible when the container width is set to a Tailwind preset or a custom width narrower than the viewport. Leave empty to keep the edges transparent.",
      schema: z.string().regex(HEX_OR_EMPTY_RE, "Hex color or empty"),
      defaultValue: "",
      scope: "public",
    },
  ]);
}
