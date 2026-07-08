import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PostDetail } from "@core-plugins/posts";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type PostTitleProps = Record<string, never>;

interface PuckMetadataShape {
  post?: PostDetail;
}

export const PostTitle: ComponentConfig<PostTitleProps> = {
  label: "Post Title",
  fields: {},
  defaultProps: {},
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="PostTitle" title="Post Title" description="Shows the post title." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const title = md.post?.title ?? "";
    if (!title) return <></>;

    return (
      <h1 className="np-post-title not-prose mb-3 text-3xl font-bold text-brand-navy md:text-4xl">{title}</h1>
    );
  },
};

export const PostTitleBlock: Omit<RegisteredBlock, "source"> = {
  name: "PostTitle",
  config: PostTitle,
  surfaces: ["template-single-post", "template-single-pillar"],
  category: "Template",
};
