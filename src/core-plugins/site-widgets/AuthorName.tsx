import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

export type AuthorNameSource = "displayName" | "fullName";
export type AuthorNameLevel = "h1" | "h2" | "h3";
export type AuthorNameAlign = "left" | "center" | "right";

export type AuthorNameProps = {
  /** Which name to render. `displayName` is the user's chosen handle
   *  (shown on posts, in admin lists). `fullName` is the optional real
   *  name set on the user profile — falls back to `displayName` when
   *  the user hasn't filled it in. */
  nameSource: AuthorNameSource;
  /** Heading level. Author template usually wants H1, but the block
   *  can be reused in sidebars where H3 reads better. */
  as: AuthorNameLevel;
  align: AuthorNameAlign;
  /** When true, the rendered name links to the author's public profile
   *  page (`/author/<username>`). Same behavior as PostMeta.linkAuthor
   *  and AuthorMeta.linkToProfile. Defaults to false on the author
   *  template (where it would self-link), but can be turned on for
   *  the same block on a sidebar surface in the future. */
  linkAuthor: boolean;
};

interface PuckMetadataShape {
  author?: AuthorProfile;
}

// `not-prose` strips the typography plugin's heading sizes, so we need
// to spell out per-level sizes ourselves. These match the admin's
// `font-display` h1/h2/h3 scale.
const SIZE_CLASS: Record<AuthorNameLevel, string> = {
  h1: "text-4xl font-bold leading-tight",
  h2: "text-3xl font-semibold leading-snug",
  h3: "text-2xl font-semibold leading-snug",
};

const TEXT_ALIGN_CLASS: Record<AuthorNameAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export const AuthorName: ComponentConfig<AuthorNameProps> = {
  label: "Author Name",
  fields: {
    nameSource: {
      type: "radio",
      label: "Show",
      options: [
        { label: "Username (display name)", value: "displayName" },
        { label: "Full / real name", value: "fullName" },
      ],
    },
    as: blockSelectField<AuthorNameLevel>({
      label: "Heading level",
      options: [
        { label: "H1", value: "h1" },
        { label: "H2", value: "h2" },
        { label: "H3", value: "h3" },
      ],
    }),
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
    linkAuthor: {
      type: "radio",
      label: "Link to author page",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: { nameSource: "displayName", as: "h1", align: "left", linkAuthor: false },
  render: ({ nameSource, as, align, linkAuthor, puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="AuthorName"
          title="Author Name"
          description={`${as.toUpperCase()} · ${nameSource === "fullName" ? "Full name" : "Username"} · ${align}`}
        />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const author = md.author;
    if (!author) return <></>;

    // Full-name fall-back: if the user hasn't set a `fullName`, render
    // the displayName so the page never goes blank.
    const text =
      nameSource === "fullName"
        ? author.fullName?.trim() || author.displayName
        : author.displayName;
    if (!text) return <></>;

    // Older saved blocks predate `align` and `linkAuthor` — treat
    // undefined as "left" / false so existing layouts don't shift.
    const safeAlign: AuthorNameAlign = align ?? "left";
    const safeLink = linkAuthor === true;
    const href = safeLink && author.username ? `/author/${author.username}` : null;
    const Tag = as;
    const tagClass = `np-author-name not-prose mb-3 font-display tracking-tight text-brand-navy ${SIZE_CLASS[as]} ${TEXT_ALIGN_CLASS[safeAlign]}`;
    return (
      <Tag className={tagClass}>
        {href ? (
          <a href={href} className="text-inherit no-underline hover:underline">
            {text}
          </a>
        ) : (
          text
        )}
      </Tag>
    );
  },
};

export const AuthorNameBlock: Omit<RegisteredBlock, "source"> = {
  name: "AuthorName",
  config: AuthorName,
  surfaces: ["template-author"],
  category: "Template",
  singleton: true,
};
