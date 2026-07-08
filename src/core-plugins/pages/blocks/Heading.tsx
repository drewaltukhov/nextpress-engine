import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

export type HeadingLevel = "h1" | "h2" | "h3" | "h4";
export type HeadingProps = {
  text: string;
  level: HeadingLevel;
};

interface SiteIdentity {
  title?: string;
  tagline?: string;
  url?: string;
}

interface PuckMetadataShape {
  themeBuilder?: boolean;
  site?: SiteIdentity;
}

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
    // Leave the literal token in place when its value is empty — mirrors
    // the Text widget so a blank gap doesn't appear in the rendered heading.
    return resolved.length > 0 ? resolved : whole;
  });
}

export const Heading: ComponentConfig<HeadingProps> = {
  label: "Heading",
  fields: {
    text: {
      type: "custom",
      label: "Text",
      render: ({ value, onChange }) => {
        const v = typeof value === "string" ? value : "";
        return (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-600">Shortcodes:</span>{" "}
              {SHORTCODE_HELP}
            </p>
          </div>
        );
      },
    },
    level: blockSelectField<HeadingLevel>({
      label: "Level",
      options: [
        { label: "H1", value: "h1" },
        { label: "H2", value: "h2" },
        { label: "H3", value: "h3" },
        { label: "H4", value: "h4" },
      ],
    }),
  },
  defaultProps: { text: "Heading", level: "h2" },
  render: ({ text, level, puck }) => {
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    if (puck?.isEditing && md.themeBuilder) {
      return (
        <BuilderCard
          name="Heading"
          title="Heading"
          description={`${level.toUpperCase()} · ${text || "Untitled heading"} — Shortcodes: ${SHORTCODE_HELP}`}
        />
      );
    }
    const site: SiteIdentity = md.site ?? {};
    const Tag = level;
    return <Tag className="np-heading">{applyShortcodes(text, site)}</Tag>;
  },
};

export const HeadingBlock: Omit<RegisteredBlock, "source"> = {
  name: "Heading",
  config: Heading,
  surfaces: [
    "page-content",
    "post-content",
    "sidebar",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-not-found",
    "template-author",
  ],
  category: "Text",
};
