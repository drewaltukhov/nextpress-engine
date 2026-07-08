import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { ICON_PATHS, ICON_LABEL, type IconKey } from "./SocialIcons";

export type AuthorLinksAlign = "left" | "center" | "right";

export type AuthorLinksProps = {
  align: AuthorLinksAlign;
};

interface PuckMetadataShape {
  author?: AuthorProfile;
}

// The user-profile admin form lets users fill these six platforms; the
// AuthorLinks block surfaces every one that has a non-empty value.
// Exported so the composite AuthorMeta block (and any future author-
// adjacent widget) can re-use the same canonical platform list.
export const PROFILE_PLATFORMS: IconKey[] = [
  "facebook",
  "x",
  "youtube",
  "linkedin",
  "whatsapp",
  "telegram",
];

const JUSTIFY_CLASS: Record<AuthorLinksAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

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

/**
 * Normalize the value the user typed in the admin profile form into a
 * full URL. Bare URLs pass through; phone-style WhatsApp values become
 * `wa.me` links; bare Telegram handles become `t.me/<handle>` links.
 * Anything that doesn't normalise is returned unchanged so the user
 * still sees their value rendered (clicking may be broken — that's a
 * profile-form validation concern, not this block's).
 */
export function normalizeSocialHref(platform: IconKey, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("mailto:")) return trimmed;
  if (platform === "whatsapp") {
    const digits = trimmed.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : trimmed;
  }
  if (platform === "telegram") {
    const handle = trimmed.replace(/^@/, "").replace(/^t\.me\//, "");
    return handle ? `https://t.me/${handle}` : trimmed;
  }
  return trimmed;
}

export const AuthorLinks: ComponentConfig<AuthorLinksProps> = {
  label: "Author Links",
  fields: {
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
  defaultProps: { align: "left" },
  render: ({ align, puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="AuthorLinks"
          title="Author Links"
          description="Social links from the author's user profile."
        />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const socials = md.author?.socials ?? {};
    const links = PROFILE_PLATFORMS.flatMap((key) => {
      const raw = socials[key];
      if (!raw) return [];
      const href = normalizeSocialHref(key, raw);
      if (!href) return [];
      return [{ key, href }];
    });
    if (links.length === 0) return <></>;
    return (
      <div className={`np-author-links not-prose mb-4 flex items-center gap-3 ${JUSTIFY_CLASS[align]}`}>
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
  },
};

export const AuthorLinksBlock: Omit<RegisteredBlock, "source"> = {
  name: "AuthorLinks",
  config: AuthorLinks,
  // Author-only — same reasoning as AuthorAvatar / AuthorName /
  // AuthorBio. The shared `sidebar` / `footer` parts have no author in
  // scope, so dropping it there would silently render nothing.
  surfaces: ["template-author"],
  category: "Template",
  singleton: true,
};
