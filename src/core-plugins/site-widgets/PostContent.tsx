import type { ComponentConfig } from "@measured/puck";
import type { ReactNode } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type PostContentProps = Record<string, never>;

interface PuckMetadataShape {
  postBody?: ReactNode;
}

export const PostContent: ComponentConfig<PostContentProps> = {
  label: "Post Content",
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="PostContent" title="Post Content" description="Shows the post's authored body." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    if (md.postBody) {
      return <article className="np-post-content prose prose-slate max-w-none">{md.postBody}</article>;
    }
    return <></>;
  },
};

export const PostContentBlock: Omit<RegisteredBlock, "source"> = {
  name: "PostContent",
  config: PostContent,
  surfaces: ["template-single-post", "template-single-pillar"],
  category: "Template",
  essential: true,
};
