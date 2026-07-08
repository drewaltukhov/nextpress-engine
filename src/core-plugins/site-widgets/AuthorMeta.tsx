import type { ComponentConfig } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { ICON_PATHS, ICON_LABEL, type IconKey } from "./SocialIcons";
import { PROFILE_PLATFORMS, normalizeSocialHref } from "./AuthorLinks";

/**
 * Composite Author widget — avatar + name + bio + social links in a
 * single block, with toggles for each part. Available on every surface
 * that may have an author in scope: single-post, single-page, the
 * author archive template, and sidebars (where the source is whichever
 * of `postAuthor` / `pageAuthor` / `author` is populated by the route).
 *
 * Issue #36: gives editors one drop instead of stacking four primitive
 * blocks (Avatar / Name / Bio / Links) every time they want author
 * meta on a post or page.
 */

export type AuthorMetaAlign = "left" | "center" | "right";
export type AuthorMetaLayout = "stacked" | "card";
export type AuthorAvatarShape = "circle" | "square";
export type AuthorAvatarSize = "sm" | "md" | "lg";
export type BioMode = "short" | "full";

export interface AuthorMetaProps {
  /** Stacked: avatar on top, name + bio + links beneath, all centered
   *  by `align`. Card: avatar on the left, name + bio + links on the
   *  right in a two-column flex; `align` then positions the whole
   *  card horizontally within its parent. */
  layout: AuthorMetaLayout;
  showAvatar: boolean;
  avatarShape: AuthorAvatarShape;
  avatarSize: AuthorAvatarSize;
  showName: boolean;
  nameSource: "displayName" | "fullName";
  showBio: boolean;
  bioMode: BioMode;
  bioShortLength: number;
  showSocialLinks: boolean;
  /** When true the avatar + name link to `/author/<username>`.
   *  Requires the resolved profile to carry a username — otherwise the
   *  widget renders the same content but as plain text. */
  linkToProfile: boolean;
  align: AuthorMetaAlign;
}

interface PuckMetadataShape {
  /** Single-post route — author of the post being shown. */
  postAuthor?: AuthorProfile | null;
  /** Single-page route — author of the page being shown. */
  pageAuthor?: AuthorProfile | null;
  /** Author archive template — the displayed author profile. */
  author?: AuthorProfile;
}

const JUSTIFY_CLASS: Record<AuthorMetaAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const ALIGN_TEXT_CLASS: Record<AuthorMetaAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const AVATAR_REM: Record<AuthorAvatarSize, number> = {
  sm: 3,
  md: 5,
  lg: 8,
};

const SHAPE_RADIUS: Record<AuthorAvatarShape, string> = {
  circle: "rounded-full",
  square: "rounded-lg",
};

function pickAuthor(md: PuckMetadataShape): AuthorProfile | null {
  return md.postAuthor ?? md.pageAuthor ?? md.author ?? null;
}

function truncateBio(bio: string, maxLen: number): string {
  if (bio.length <= maxLen) return bio;
  // Cut at the last word boundary before the cap to avoid mid-word
  // truncation. Falls back to a hard slice if the bio has no spaces.
  const slice = bio.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return trimmed.replace(/[.,;:!?–—\s]+$/, "") + "…";
}

function IconSvg({ iconKey, className }: { iconKey: IconKey; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={ICON_PATHS[iconKey]} />
    </svg>
  );
}

function buildInitials(displayName: string): string {
  return displayName
    .split(" ")
    .map((p) => p.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const AuthorMeta: ComponentConfig<AuthorMetaProps> = {
  label: "Author",
  fields: {
    layout: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Stacked", value: "stacked" },
        { label: "Card (avatar + text columns)", value: "card" },
      ],
    },
    showAvatar: {
      type: "radio",
      label: "Show avatar",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    avatarShape: {
      type: "radio",
      label: "Avatar shape",
      options: [
        { label: "Circle", value: "circle" },
        { label: "Square", value: "square" },
      ],
    },
    avatarSize: {
      type: "radio",
      label: "Avatar size",
      options: [
        { label: "Small", value: "sm" },
        { label: "Medium", value: "md" },
        { label: "Large", value: "lg" },
      ],
    },
    showName: {
      type: "radio",
      label: "Show name",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    nameSource: {
      type: "radio",
      label: "Name source",
      options: [
        { label: "Display name", value: "displayName" },
        { label: "Full name", value: "fullName" },
      ],
    },
    showBio: {
      type: "radio",
      label: "Show bio",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    bioMode: {
      type: "radio",
      label: "Bio length",
      options: [
        { label: "Short", value: "short" },
        { label: "Full", value: "full" },
      ],
    },
    bioShortLength: {
      type: "number",
      label: "Short bio length (chars)",
      min: 60,
      max: 400,
      step: 10,
    },
    showSocialLinks: {
      type: "radio",
      label: "Show social links",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    linkToProfile: {
      type: "radio",
      label: "Link avatar + name to /author/<username>",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
  },
  defaultProps: {
    layout: "stacked",
    showAvatar: true,
    avatarShape: "circle",
    avatarSize: "md",
    showName: true,
    nameSource: "displayName",
    showBio: true,
    bioMode: "short",
    bioShortLength: 160,
    showSocialLinks: true,
    linkToProfile: true,
    align: "left",
  },
  render: (props) => {
    if (props.puck?.isEditing) {
      return (
        <BuilderCard name="AuthorMeta"
          title="Author"
          description={`Avatar + name + bio + social links. Reads the active route's author (post / page / archive). · ${props.layout ?? "stacked"}`}
        />
      );
    }
    const md = (props.puck?.metadata ?? {}) as PuckMetadataShape;
    const author = pickAuthor(md);
    if (!author) return <></>;

    const align = props.align;
    const layout = props.layout ?? "stacked";
    const profileHref =
      props.linkToProfile && author.username ? `/author/${author.username}` : null;

    // ─── Avatar ──────────────────────────────────────────────
    let avatarNode: React.ReactNode = null;
    if (props.showAvatar) {
      const widthStyle: CSSProperties = {
        maxWidth: `${AVATAR_REM[props.avatarSize]}rem`,
        width: "100%",
      };
      const radius = SHAPE_RADIUS[props.avatarShape];
      const inner = author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatarUrl}
          alt={author.displayName}
          className={`block aspect-square w-full object-cover ${radius}`}
        />
      ) : (
        <div
          className={`flex aspect-square w-full items-center justify-center bg-brand-light-green text-brand-navy font-bold ${radius}`}
        >
          {buildInitials(author.displayName) || "A"}
        </div>
      );
      const wrapped = profileHref ? (
        <a href={profileHref} className="block" aria-label={`View ${author.displayName}'s profile`}>
          {inner}
        </a>
      ) : (
        inner
      );
      // In Card layout the avatar sits in its own flex column with no
      // mb-3 — that vertical breathing space belongs at the row level
      // so the right-side text aligns to the avatar's center.
      avatarNode =
        layout === "card" ? (
          <div className="shrink-0" style={widthStyle}>
            {wrapped}
          </div>
        ) : (
          <div className={`not-prose mb-3 flex w-full ${JUSTIFY_CLASS[align]}`}>
            <div style={widthStyle}>{wrapped}</div>
          </div>
        );
    }

    // ─── Name ────────────────────────────────────────────────
    let nameNode: React.ReactNode = null;
    if (props.showName) {
      const fullName = author.fullName?.trim();
      const text =
        props.nameSource === "fullName"
          ? fullName || author.displayName
          : author.displayName;
      const inner = (
        <span className="font-semibold text-brand-navy">{text}</span>
      );
      // Card layout left-aligns its text column regardless of the
      // overall block alignment — `align` only places the card itself.
      const textAlignClass =
        layout === "card" ? "text-left" : ALIGN_TEXT_CLASS[align];
      nameNode = (
        <div className={`not-prose mb-2 ${textAlignClass}`}>
          {profileHref ? (
            <a
              href={profileHref}
              className="hover:text-brand-green transition-colors"
            >
              {inner}
            </a>
          ) : (
            inner
          )}
        </div>
      );
    }

    // ─── Bio ─────────────────────────────────────────────────
    let bioNode: React.ReactNode = null;
    if (props.showBio) {
      const raw = author.bio?.trim() ?? "";
      if (raw.length > 0) {
        const text =
          props.bioMode === "short" ? truncateBio(raw, props.bioShortLength) : raw;
        const textAlignClass =
          layout === "card" ? "text-left" : ALIGN_TEXT_CLASS[align];
        bioNode = (
          <p className={`not-prose mb-3 text-sm text-slate-600 ${textAlignClass}`}>
            {text}
          </p>
        );
      }
    }

    // ─── Social links ───────────────────────────────────────
    let socialsNode: React.ReactNode = null;
    if (props.showSocialLinks) {
      const socials = author.socials ?? {};
      const links = PROFILE_PLATFORMS.flatMap((key) => {
        const raw = socials[key];
        if (!raw) return [];
        const href = normalizeSocialHref(key, raw);
        if (!href) return [];
        return [{ key, href }];
      });
      if (links.length > 0) {
        const justifyClass =
          layout === "card" ? "justify-start" : JUSTIFY_CLASS[align];
        socialsNode = (
          <div className={`not-prose flex flex-wrap items-center gap-3 ${justifyClass}`}>
            {links.map(({ key, href }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 transition hover:text-brand-green"
                aria-label={ICON_LABEL[key]}
              >
                <IconSvg iconKey={key} className="size-5" />
              </a>
            ))}
          </div>
        );
      }
    }

    if (layout === "card") {
      return (
        <div className={`np-author-meta not-prose mb-4 flex w-full ${JUSTIFY_CLASS[align]}`}>
          <div className="flex max-w-prose items-start gap-4">
            {avatarNode}
            <div className="min-w-0 flex-1">
              {nameNode}
              {bioNode}
              {socialsNode}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="np-author-meta not-prose mb-4">
        {avatarNode}
        {nameNode}
        {bioNode}
        {socialsNode}
      </div>
    );
  },
};

export const AuthorMetaBlock: Omit<RegisteredBlock, "source"> = {
  name: "AuthorMeta",
  config: AuthorMeta,
  // Available wherever an author is in scope:
  // - sidebar: render.tsx now also passes pageAuthor / postAuthor when
  //   the active template puts a page or post in scope, so dropping
  //   AuthorMeta in a sidebar Just Works.
  // - template-single-post / template-single-page: post body / page
  //   body author.
  // - template-author: the dedicated author-archive page.
  surfaces: [
    "sidebar",
    "template-single-post",
    "template-single-pillar",
    "template-single-page",
    "template-author",
  ],
  category: "Template",
};
