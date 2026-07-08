import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

/**
 * Plain-text widget. Renders a paragraph with shortcode substitution.
 *
 * Supported shortcodes (kept in sync with `SHORTCODE_HELP` below so the
 * field description in the Puck inspector and the in-widget hint stay
 * canonical):
 *
 *   [year]     →  current four-digit year
 *   [title]    →  `site.title` from Settings → SEO
 *   [site]     →  alias of `[title]`
 *   [tagline]  →  `site.tagline`
 *   [url]      →  `site.url`
 *
 * Site identity tokens (`title`/`site`/`tagline`/`url`) read from
 * `puck.metadata.site` which the public renderer fills from
 * `site_settings` in one place — see `core-plugins/themes/render.tsx`.
 * If a token resolves to an empty string (no setting saved), the
 * literal shortcode is left in place rather than collapsing to "".
 *
 * Sticky note: there's no per-widget sticky toggle. Drop this inside a
 * "Sticky Container" widget if you want the row to pin on scroll —
 * one container makes the whole group sticky together.
 */

interface SiteIdentity {
  title?: string;
  tagline?: string;
  url?: string;
}

interface PuckMetadataShape {
  site?: SiteIdentity;
}

export interface TextProps {
  text: string;
}

/** Human-readable help shown in the Puck inspector + BuilderCard. */
const SHORTCODE_HELP = [
  "[year] — current year",
  "[title] / [site] — site title",
  "[tagline] — site tagline",
  "[url] — site URL",
].join(" · ");

function buildShortcodes(site: SiteIdentity): Record<string, () => string> {
  return {
    year: () => String(new Date().getFullYear()),
    title: () => site.title ?? "",
    site: () => site.title ?? "",
    tagline: () => site.tagline ?? "",
    url: () => site.url ?? "",
  };
}

function applyShortcodes(input: string, site: SiteIdentity): string {
  const codes = buildShortcodes(site);
  return input.replace(/\[(\w+)\]/g, (whole, name: string) => {
    const fn = codes[name.toLowerCase()];
    if (!fn) return whole;
    const resolved = fn();
    // Leave the literal shortcode in place when the value is empty —
    // less confusing than a bare gap of whitespace in the rendered copy.
    return resolved.length > 0 ? resolved : whole;
  });
}

export const Text: ComponentConfig<TextProps> = {
  label: "Text",
  fields: {
    text: {
      type: "custom",
      label: "Text",
      render: ({ value, onChange }) => {
        const v = typeof value === "string" ? value : "";
        return (
          <div className="flex flex-col gap-2">
            <textarea
              value={v}
              onChange={(e) => onChange(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-600">Shortcodes:</span>{" "}
              {SHORTCODE_HELP}
            </p>
          </div>
        );
      },
    },
  },
  defaultProps: {
    text: "Edit me. Supports shortcodes — see field hint below.",
  },
  permissions: { delete: true, duplicate: true },
  render: ({ text, puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="Text"
          title="Text"
          description={`Shortcodes: ${SHORTCODE_HELP}`}
        >
          {text ? (
            <p className="m-0 whitespace-pre-wrap text-sm text-slate-600">{text}</p>
          ) : null}
        </BuilderCard>
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const site: SiteIdentity = md.site ?? {};
    return (
      <p className="np-text-widget not-prose mb-4 whitespace-pre-wrap text-sm text-slate-700">
        {applyShortcodes(text, site)}
      </p>
    );
  },
};

export const TextBlock: Omit<RegisteredBlock, "source"> = {
  name: "Text",
  config: Text,
  surfaces: [
    "page-content",
    "post-content",
    "header",
    "footer",
    "sidebar",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-not-found",
  ],
  category: "Site",
};
