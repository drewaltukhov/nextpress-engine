import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

// Inline SVGs intentionally — lucide-react v1's Icon component is
// marked "use client" and calls useContext internally. Server-rendering
// it inside Puck's <Render> via renderActiveTheme crashes with
// "Cannot read properties of null (reading 'useContext')" because
// Puck's render path doesn't bridge client components through Next.js's
// RSC machinery. Plain SVGs render cleanly anywhere.
//
// Icon paths are brand marks from Simple Icons (CC0). Single-path,
// 24x24 viewBox, fill="currentColor" so a parent text color flows
// through.

export type IconKey =
  | "facebook"
  | "x"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok"
  | "whatsapp"
  | "pinterest"
  | "reddit"
  | "github"
  | "discord"
  | "telegram"
  | "email";

export const ICON_PATHS: Record<IconKey, string> = {
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.897 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.897-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  whatsapp:
    "M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z",
  pinterest:
    "M12 0a12 12 0 0 0-4.373 23.178c-.105-.91-.197-2.31.041-3.302.215-.873 1.388-5.555 1.388-5.555s-.353-.71-.353-1.756c0-1.643.953-2.871 2.14-2.871 1.011 0 1.5.759 1.5 1.671 0 1.018-.648 2.541-.984 3.952-.281 1.181.592 2.144 1.756 2.144 2.108 0 3.728-2.221 3.728-5.428 0-2.838-2.04-4.823-4.953-4.823-3.373 0-5.354 2.529-5.354 5.144 0 1.018.392 2.111.881 2.706.097.117.111.219.082.339-.09.375-.291 1.181-.331 1.347-.052.217-.171.263-.395.158-1.474-.687-2.395-2.842-2.395-4.575 0-3.726 2.708-7.149 7.804-7.149 4.097 0 7.281 2.92 7.281 6.821 0 4.07-2.567 7.342-6.13 7.342-1.198 0-2.323-.622-2.708-1.357 0 0-.593 2.257-.736 2.81-.267 1.027-.987 2.314-1.471 3.098A12 12 0 1 0 12 0z",
  reddit:
    "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z",
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  discord:
    "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  email:
    "M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67zM22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908z",
};

export const ICON_LABEL: Record<IconKey, string> = {
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  pinterest: "Pinterest",
  reddit: "Reddit",
  github: "GitHub",
  discord: "Discord",
  telegram: "Telegram",
  email: "Email",
};

interface IconGroup {
  title: string;
  keys: IconKey[];
}

const ICON_GROUPS: IconGroup[] = [
  { title: "Essentials", keys: ["facebook", "x", "instagram"] },
  { title: "Business & Professional", keys: ["linkedin", "youtube"] },
  { title: "Niche & Growth", keys: ["tiktok", "whatsapp", "pinterest", "reddit"] },
  { title: "Developer & Tech", keys: ["github", "discord", "telegram"] },
  { title: "Contact", keys: ["email"] },
];

const ICON_KEYS: IconKey[] = ICON_GROUPS.flatMap((g) => g.keys);

export type SocialLinks = Record<IconKey, string>;

const DEFAULT_LINKS: SocialLinks = ICON_KEYS.reduce<SocialLinks>((acc, key) => {
  acc[key] = "";
  return acc;
}, {} as SocialLinks);

export type SocialIconsProps = {
  links: SocialLinks;
  /** "left" | "center" | "right" — alignment within the parent. */
  align: "left" | "center" | "right";
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

// Merge whatever's in puckData into the full shape so old saves (with
// missing keys, or the legacy flat shape that put each URL at the top
// level instead of under `links`) keep working. `twitter` is migrated
// into `x` since the brand was renamed.
function normaliseLinks(value: unknown, legacy?: Record<string, unknown>): SocialLinks {
  const next: SocialLinks = { ...DEFAULT_LINKS };
  if (value && typeof value === "object") {
    for (const key of ICON_KEYS) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === "string") next[key] = v;
    }
  }
  if (legacy) {
    const carry: Record<string, IconKey> = {
      github: "github",
      linkedin: "linkedin",
      youtube: "youtube",
      twitter: "x",
      email: "email",
    };
    for (const [src, dest] of Object.entries(carry)) {
      const v = legacy[src];
      if (typeof v === "string" && v.trim().length > 0 && !next[dest]) {
        next[dest] = v;
      }
    }
  }
  return next;
}

function SocialLinksEditor({
  value,
  onChange,
}: {
  value: SocialLinks;
  onChange: (next: SocialLinks) => void;
}) {
  const safe = normaliseLinks(value);
  return (
    <div className="space-y-3">
      {ICON_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {group.title}
          </div>
          <div className="space-y-1">
            {group.keys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
                  title={ICON_LABEL[key]}
                >
                  <IconSvg iconKey={key} className="size-4" />
                </span>
                <input
                  type="text"
                  value={safe[key]}
                  onChange={(e) => onChange({ ...safe, [key]: e.target.value })}
                  placeholder={key === "email" ? "you@example.com" : "https://…"}
                  aria-label={`${ICON_LABEL[key]} ${key === "email" ? "address" : "URL"}`}
                  className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const renderLinksField: CustomField<SocialLinks>["render"] = function LinksFieldRender({
  value,
  onChange,
}) {
  // Puck passes `value: unknown` through the CustomField generic; coerce
  // here so the editor always receives a fully-shaped record.
  const safe = normaliseLinks(value);
  return <SocialLinksEditor value={safe} onChange={onChange} />;
};

export const SocialIcons: ComponentConfig<SocialIconsProps> = {
  label: "Social Icons",
  fields: {
    links: {
      type: "custom",
      label: "Social links",
      render: renderLinksField,
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
    links: { ...DEFAULT_LINKS },
    align: "left",
  },
  render: (props) => {
    if (props.puck?.isEditing) {
      return (
        <BuilderCard name="SocialIcons"
          title="Social Icons"
          description="Links to your social networks. Set URLs in the inspector — only filled-in icons render on the public site."
        />
      );
    }
    const safe = normaliseLinks(props.links, props as unknown as Record<string, unknown>);
    const links = ICON_KEYS.flatMap((key) => {
      const raw = safe[key]?.trim();
      if (!raw) return [];
      // Email rows accept either a bare address or a full mailto: URI;
      // normalise to mailto: so the anchor opens the user's mail client.
      const href = key === "email" && !raw.startsWith("mailto:") ? `mailto:${raw}` : raw;
      return [{ key, href }];
    });
    if (links.length === 0) return <></>;
    const justify =
      props.align === "center"
        ? "justify-center"
        : props.align === "right"
          ? "justify-end"
          : "justify-start";
    return (
      <div className={`np-social-icons not-prose flex flex-wrap items-center gap-3 ${justify}`}>
        {links.map(({ key, href }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 transition hover:text-brand-green"
            aria-label={ICON_LABEL[key]}
          >
            <IconSvg iconKey={key} className="size-4" />
          </a>
        ))}
      </div>
    );
  },
};

export const SocialIconsBlock: Omit<RegisteredBlock, "source"> = {
  name: "SocialIcons",
  config: SocialIcons,
  surfaces: ["footer", "sidebar"],
  category: "Template",
};
