import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PostDetail } from "@core-plugins/posts";
import type { TopicListItem } from "@core-plugins/topics";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  formatDate,
  parseSqliteUtc,
  type DateFormat,
} from "@core/datetime";

export type PostMetaNameSource = "displayName" | "fullName";

export type PostMetaProps = {
  showAuthor: boolean;
  /** Text prepended to the author's display name when `showAuthor` is on.
   *  Examples: "By ", "Author: ". Empty string renders the bare name. */
  authorPrefix: string;
  /** Which name to render. `displayName` is the user's chosen handle.
   *  `fullName` is the optional real name on the user profile — falls
   *  back to `displayName` when the user hasn't filled it in. */
  nameSource: PostMetaNameSource;
  /** When true, the rendered name links to the author's public profile
   *  page (`/author/<username>`). Requires the post's `createdBy` user
   *  to still exist; renders as plain text otherwise. */
  linkAuthor: boolean;
  showDate: boolean;
  showTopics: boolean;
};

interface PuckMetadataShape {
  post?: PostDetail;
  postAuthor?: AuthorProfile | null;
  postTopics?: TopicListItem[];
  display?: { dateFormat: DateFormat; timezone: string };
}

export const PostMeta: ComponentConfig<PostMetaProps> = {
  label: "Post Meta",
  fields: {
    showAuthor: {
      type: "radio",
      label: "Show author",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    nameSource: {
      type: "radio",
      label: "Show",
      options: [
        { label: "Username (display name)", value: "displayName" },
        { label: "Full / real name", value: "fullName" },
      ],
    },
    authorPrefix: {
      type: "text",
      label: "Author prefix",
    },
    linkAuthor: {
      type: "radio",
      label: "Link to author page",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    showDate: {
      type: "radio",
      label: "Show date",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    showTopics: {
      type: "radio",
      label: "Show topic chips",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: {
    showAuthor: true,
    nameSource: "displayName",
    authorPrefix: "By",
    linkAuthor: true,
    showDate: true,
    showTopics: true,
  },
  // Hide author-specific fields when the author isn't being shown.
  // Values persist in puckData so toggling Show author back on
  // restores the previous picks.
  resolveFields: (data, { fields }) => {
    if (data.props?.showAuthor !== false) return fields;
    const hide = ["authorPrefix", "nameSource", "linkAuthor"];
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => !hide.includes(key)),
    );
    return filtered as typeof fields;
  },
  render: ({ showAuthor, nameSource, authorPrefix, linkAuthor, showDate, showTopics, puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="PostMeta" title="Post Meta" description="Shows author, date, and topic chips." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const post = md.post;
    if (!post) {
      return <></>;
    }
    const dateFormat = md.display?.dateFormat ?? DEFAULT_DATE_FORMAT;
    const timezone = md.display?.timezone ?? DEFAULT_TIMEZONE;
    const dateText = post.publishedAt
      ? formatDate(parseSqliteUtc(post.publishedAt), dateFormat, timezone)
      : null;
    const topics = md.postTopics ?? [];

    // Pick the displayed name. Older saves predate `nameSource` — fall
    // back to displayName so existing posts render unchanged.
    const safeNameSource: PostMetaNameSource = nameSource ?? "displayName";
    const profile = md.postAuthor ?? null;
    const fullName = profile?.fullName?.trim();
    const authorName =
      safeNameSource === "fullName" && fullName
        ? fullName
        : (profile?.displayName ?? post.authorDisplayName ?? "");

    // Trim the saved prefix; we re-append the space inline between
    // the static prefix and the (possibly linked) name. Authors can
    // type "By" or "Author:" without worrying about trailing
    // whitespace.
    const trimmedPrefix = (authorPrefix ?? "").trim();

    // Link only when the toggle is on AND we have a profile to link to.
    // Older saves predate the toggle — default true, but absence of a
    // resolved profile falls back to plain text gracefully.
    const safeLink = linkAuthor !== false;
    const authorHref =
      safeLink && profile?.username ? `/author/${profile.username}` : null;

    // Wrap only the name in the anchor — the prefix ("By", "Author:")
    // stays as plain text. Whole-string links read as "click here for
    // an author named 'By Drew'" which the prefix isn't part of.
    const authorNode = authorName ? (
      <span>
        {trimmedPrefix ? `${trimmedPrefix} ` : null}
        {authorHref ? (
          <a
            href={authorHref}
            className="text-slate-500 no-underline hover:text-brand-green hover:underline"
          >
            {authorName}
          </a>
        ) : (
          authorName
        )}
      </span>
    ) : null;

    return (
      <div className="np-post-meta not-prose mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
        {showAuthor && authorNode ? authorNode : null}
        {showAuthor && authorNode && (showDate || showTopics) ? <span aria-hidden>·</span> : null}
        {showDate && dateText ? <time dateTime={post.publishedAt ?? undefined}>{dateText}</time> : null}
        {showTopics && topics.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <li key={t.id}>
                <a
                  href={`/topics/${t.slug}`}
                  className="inline-flex items-center rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand-navy no-underline hover:bg-brand-light/70"
                >
                  {t.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
};

export const PostMetaBlock: Omit<RegisteredBlock, "source"> = {
  name: "PostMeta",
  config: PostMeta,
  surfaces: ["template-single-post", "template-single-pillar"],
  category: "Template",
};
