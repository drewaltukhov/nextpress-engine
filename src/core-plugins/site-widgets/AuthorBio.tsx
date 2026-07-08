import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type AuthorBioProps = Record<string, never>;

interface PuckMetadataShape {
  author?: AuthorProfile;
}

export const AuthorBio: ComponentConfig<AuthorBioProps> = {
  label: "Author Bio",
  fields: {},
  defaultProps: {},
  render: ({ puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="AuthorBio" title="Author Bio" description="Renders the author's bio from their user profile." />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const bio = md.author?.bio?.trim();
    if (!bio) return <></>;
    // `whitespace-pre-line` preserves single line breaks the user typed
    // in the admin's bio field, without forcing a Markdown parser.
    return (
      <p className="np-author-bio not-prose mb-4 whitespace-pre-line text-base leading-relaxed text-slate-700">
        {bio}
      </p>
    );
  },
};

export const AuthorBioBlock: Omit<RegisteredBlock, "source"> = {
  name: "AuthorBio",
  config: AuthorBio,
  surfaces: ["template-author"],
  category: "Template",
  singleton: true,
};
