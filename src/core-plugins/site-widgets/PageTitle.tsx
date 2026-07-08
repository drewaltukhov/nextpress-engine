import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PageDetail } from "@core-plugins/pages";
import { BuilderCard } from "@core/blocks/BuilderCard";

/**
 * Renders the current page's title above its content. Mirrors the
 * `PostTitle` widget — same h1 styling, same builder placeholder —
 * but reads `metadata.page.title` instead. The active-theme renderer
 * already surfaces `ctx.page` to metadata, so the widget needs no
 * special wiring beyond reading from there.
 *
 * Surfaces:
 *   - `template-single-page` — default location (added to the seed
 *     above PageContent so existing pages get a title without manual
 *     setup).
 *   - `template-homepage` — optional. Useful when the homepage is
 *     backed by a static page; otherwise the widget renders nothing
 *     because `metadata.page` is absent.
 */
export type PageTitleProps = Record<string, never>;

interface PuckMetadataShape {
  page?: PageDetail;
}

export const PageTitle: ComponentConfig<PageTitleProps> = {
  label: "Page Title",
  fields: {},
  defaultProps: {},
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="PageTitle" title="Page Title" description="Shows the page title." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const title = md.page?.title ?? "";
    if (!title) return <></>;
    return (
      <h1 className="np-page-title not-prose mb-3 text-3xl font-bold text-brand-navy md:text-4xl">{title}</h1>
    );
  },
};

export const PageTitleBlock: Omit<RegisteredBlock, "source"> = {
  name: "PageTitle",
  config: PageTitle,
  surfaces: ["template-single-page", "template-homepage"],
  category: "Template",
};
