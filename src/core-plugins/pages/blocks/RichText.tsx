import type { ComponentConfig } from "@measured/puck";
import type { MediaSummary } from "@core-plugins/media/service";
import type { RegisteredBlock } from "@core/blocks/registry";
import { RichTextEditor } from "@core/components/RichTextEditor";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { expandMediaShortcodes } from "./shortcodes";

export type RichTextProps = {
  html: string;
};

interface PuckMetadataShape {
  media?: Record<string, MediaSummary>;
  /** Set by ThemeBuilderClient. The theme builder shows a uniform
   *  BuilderCard placeholder; the page/post editor renders the actual
   *  styled HTML so content authors get a WYSIWYG preview. */
  themeBuilder?: boolean;
}

export const RichText: ComponentConfig<RichTextProps> = {
  label: "Rich Text",
  fields: {
    html: {
      type: "custom",
      label: "Content",
      render: ({ value, onChange }) => (
        <RichTextEditor
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      ),
    },
  },
  defaultProps: { html: "<p>Lorem ipsum dolor sit amet…</p>" },
  // Render plain HTML server-side. Media shortcodes (`[img id]`,
  // `[thumb id]`) are expanded inline against `puck.metadata`'s media
  // map — public route prefills it; in the editor or theme zones it's
  // empty, so shortcodes still render as plain images via the
  // `/media/{id}` route. The previous client-side RichTextDisplay
  // wrapper added click-to-lightbox enrichment but blocked use of
  // RichText in theme zones (Puck's <Render> in renderActiveTheme
  // doesn't bridge `"use client"` components through Next's RSC
  // machinery the way pages/published-view's render does, so hooks
  // inside the wrapper threw "Invalid hook call"). Plain HTML works
  // everywhere; the lightbox feature can come back as a global
  // delegated handler if needed.
  render: ({ html, puck }) => {
    const metadata = (puck?.metadata ?? {}) as PuckMetadataShape;
    if (puck?.isEditing && metadata.themeBuilder) {
      return (
        <BuilderCard name="RichText"
          title="Rich Text"
          description="Formatted text — headings, lists, links, inline images, and `[img id]` / `[thumb id]` media shortcodes."
        />
      );
    }
    const mediaMap = metadata.media ?? {};
    const expanded = expandMediaShortcodes(html ?? "", mediaMap);
    return <div className="np-rich-text" dangerouslySetInnerHTML={{ __html: expanded }} />;
  },
};

export const RichTextBlock: Omit<RegisteredBlock, "source"> = {
  name: "RichText",
  config: RichText,
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
  ] as const,
  category: "Site",
};
