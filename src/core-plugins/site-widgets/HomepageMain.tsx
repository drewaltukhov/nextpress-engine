import type { ComponentConfig } from "@measured/puck";
import type { ReactNode } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { HomepageBuilderCard } from "./HomepageBuilderCard";
import {
  PostListView,
  type PostListOptions,
} from "./PostListView";

/**
 * "Homepage Content" block for the homepage template's main zone.
 *
 * In the builder it shows a placeholder describing the configured
 * homepage source. In production it renders one of two things,
 * depending on what the homepage source resolved to upstream:
 *   - When `metadata.pageBody` is present (homepage source = a static
 *     page), this block renders that page's authored body. Other
 *     widgets the user dropped before/after this block in the homepage
 *     template wrap around it.
 *   - Otherwise (recent / topic / pillar source), it delegates to
 *     `<PostListView>` using the fully-resolved `PostListOptions`
 *     from `metadata.homepageDisplay` (set by Task 6 server-side).
 *
 * The block has no per-instance Puck props. Source + display options
 * are site-wide settings — edited in Settings → Content, not in this
 * block's inspector. (We used to mirror the same two panels here, which
 * meant the same site-wide state was editable from two places.)
 */

interface PuckMetadataShape {
  pageBody?: ReactNode;
  homepageDisplay?: PostListOptions;
}

export type HomepageMainProps = Record<string, never>;

export const HomepageMain: ComponentConfig<HomepageMainProps> = {
  label: "Homepage Content",
  permissions: { delete: false, duplicate: false },
  fields: {
    note: {
      type: "custom",
      label: "Settings",
      render: () => (
        <p className="text-xs text-slate-500">
          The homepage source and display options are site-wide settings — edit
          them in <strong>Settings → Content</strong>.
        </p>
      ),
    },
  },
  defaultProps: {},
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return <HomepageBuilderCard />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    if (md.pageBody) return <div className="np-homepage-main">{md.pageBody}</div>;
    if (!md.homepageDisplay) return <></>;
    return (
      <div className="np-homepage-main">
        <PostListView {...md.homepageDisplay} />
      </div>
    );
  },
};

export const HomepageMainBlock: Omit<RegisteredBlock, "source"> = {
  name: "HomepageMain",
  config: HomepageMain,
  surfaces: ["template-homepage"],
  category: "Template",
  essential: true,
};
