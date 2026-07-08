import type { ComponentConfig } from "@measured/puck";
import type { ReactNode } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

/**
 * Renders the current page's authored Puck content. Inside a Single
 * Page template's Main zone, this block is the bridge between the
 * theme chrome and the page editor's authored body. The active-theme
 * renderer pre-renders the page body (via `renderPageBodyContent`) and
 * stuffs the resulting ReactNode into `puck.metadata.pageBody`.
 *
 * Inside the theme builder (no real page in scope) we render a
 * placeholder so the slot is visible.
 */
export type PageContentProps = Record<string, never>;

interface PuckMetadataShape {
  pageBody?: ReactNode;
}

export const PageContent: ComponentConfig<PageContentProps> = {
  label: "Page Content",
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="PageContent" title="Page Content" description="Shows the page's authored content." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    if (md.pageBody) return <div className="np-page-content">{md.pageBody}</div>;
    return <></>;
  },
};

export const PageContentBlock: Omit<RegisteredBlock, "source"> = {
  name: "PageContent",
  config: PageContent,
  surfaces: ["template-single-page"],
  category: "Template",
  essential: true,
};
