import type { ComponentConfig, CustomField } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PostDetail } from "@core-plugins/posts";
import type { PageDetail } from "@core-plugins/pages";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { blockSelectField } from "@core/blocks/BlockSelect";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  formatDate,
  parseSqliteUtc,
  type DateFormat,
} from "@core/datetime";

export type HeroTitleLevel = "h1" | "h2" | "h3";
export type HeroTitleAlign = "left" | "center" | "right";
export type HeroTitleOverlayColor =
  | "none"
  | "black"
  | "white"
  | "navy"
  | "green"
  | "light";
export type HeroTitleNameSource = "displayName" | "fullName";
export type HeroTitleAvatarShape = "original" | "circle";
export type HeroTitleTextColor =
  | "auto"
  | "white"
  | "black"
  | "navy"
  | "green"
  | "light"
  | "custom";

export type HeroTitleProps = {
  imageUrl: string;
  imageAlt: string;
  overlayColor: HeroTitleOverlayColor;
  as: HeroTitleLevel;
  align: HeroTitleAlign;
  showAuthor: boolean;
  nameSource: HeroTitleNameSource;
  showAvatar: boolean;
  /** Avatar size in rem. Avatar fills its box up to this max-width. */
  avatarSizeRem: number;
  avatarShape: HeroTitleAvatarShape;
  showDate: boolean;
  /** Title color. "auto" picks white over dark overlays / brand-navy
   *  otherwise. "custom" reads from titleColorCustom. */
  titleColorPreset: HeroTitleTextColor;
  titleColorCustom: string;
  /** Author byline color. Same option set as the title. */
  authorColorPreset: HeroTitleTextColor;
  authorColorCustom: string;
  /** Date color. Same option set as the title. */
  dateColorPreset: HeroTitleTextColor;
  dateColorCustom: string;
  /** Round corners on the outer hero section. */
  rounded: boolean;
  /** Vertical padding (rem) applied symmetrically to top and bottom. */
  paddingYRem: number;
  /** When true, the rendered author name links to /author/<username>.
   *  Mirrors `PostMeta.linkAuthor` / `AuthorMeta.linkToProfile`. */
  linkAuthor: boolean;
};

interface PuckMetadataShape {
  post?: PostDetail;
  page?: PageDetail;
  postAuthor?: AuthorProfile | null;
  pageAuthor?: AuthorProfile | null;
  display?: { dateFormat: DateFormat; timezone: string };
}

export const OVERLAY_BG: Record<Exclude<HeroTitleOverlayColor, "none">, string> = {
  black: "bg-black/45",
  white: "bg-white/55",
  navy: "bg-brand-navy/55",
  green: "bg-brand-green/55",
  light: "bg-brand-light-green/70",
};

// Whether the overlay reads as "dark" (white text on top) vs "light"
// (brand-navy text on top). `none` is treated as dark so the default
// white text still shows over a typical dark photograph.
export const OVERLAY_IS_DARK: Record<HeroTitleOverlayColor, boolean> = {
  none: true,
  black: true,
  navy: true,
  green: true,
  white: false,
  light: false,
};

const ALIGN_ITEMS: Record<HeroTitleAlign, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

const SIZE_CLASS: Record<HeroTitleLevel, string> = {
  h1: "text-4xl md:text-6xl font-bold leading-tight",
  h2: "text-3xl md:text-5xl font-bold leading-tight",
  h3: "text-2xl md:text-4xl font-semibold leading-snug",
};

const PRESET_TEXT_COLOR: Record<
  Exclude<HeroTitleTextColor, "auto" | "custom">,
  string
> = {
  white: "text-white",
  black: "text-black",
  navy: "text-brand-navy",
  green: "text-brand-green",
  light: "text-brand-light-green",
};

const TEXT_COLOR_OPTIONS: { label: string; value: HeroTitleTextColor }[] = [
  { label: "Auto (matches background)", value: "auto" },
  { label: "White", value: "white" },
  { label: "Black", value: "black" },
  { label: "Dark blue", value: "navy" },
  { label: "Green", value: "green" },
  { label: "Mint", value: "light" },
  { label: "Custom…", value: "custom" },
];

interface ResolvedColor {
  className: string;
  style?: CSSProperties;
}

function resolveTextColor(
  preset: HeroTitleTextColor | undefined,
  customHex: string | undefined,
  fallbackClass: string,
): ResolvedColor {
  const safe = preset ?? "auto";
  if (safe === "custom") {
    const hex =
      typeof customHex === "string" && /^#[0-9a-fA-F]{6}$/.test(customHex)
        ? customHex
        : "#000000";
    return { className: "", style: { color: hex } };
  }
  if (safe === "auto") return { className: fallbackClass };
  return { className: PRESET_TEXT_COLOR[safe] };
}

// Inline custom-hex picker for the title/author/date color fields.
// Standalone component so the lint rule about anonymous component
// renders stays satisfied. Mirrors the same pattern in `Hero.tsx`.
function HexField({
  value,
  onChange,
  defaultHex,
  ariaLabel,
}: {
  value: unknown;
  onChange: (next: string) => void;
  defaultHex: string;
  ariaLabel: string;
}) {
  const hex =
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : defaultHex;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        aria-label={ariaLabel}
      />
      <input
        type="text"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
        placeholder={defaultHex}
      />
    </div>
  );
}

function renderHexField(
  defaultHex: string,
  ariaLabel: string,
): CustomField<string>["render"] {
  function HexFieldRender({
    value,
    onChange,
  }: {
    value: unknown;
    onChange: (next: string) => void;
  }) {
    return (
      <HexField
        value={value}
        onChange={onChange}
        defaultHex={defaultHex}
        ariaLabel={ariaLabel}
      />
    );
  }
  return HexFieldRender;
}

export const HeroTitle: ComponentConfig<HeroTitleProps> = {
  label: "Hero Title",
  fields: {
    imageUrl: {
      type: "custom",
      label: "Background image",
      render: ({ value, onChange }) => (
        <MediaPickerInput
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          allowUpload
          variant="preview"
        />
      ),
    },
    imageAlt: {
      type: "text",
      label: "Background image alt text",
    },
    overlayColor: blockSelectField<HeroTitleOverlayColor>({
      label: "Image overlay",
      options: [
        { label: "None", value: "none" },
        { label: "Black", value: "black" },
        { label: "White", value: "white" },
        { label: "Dark blue", value: "navy" },
        { label: "Green", value: "green" },
        { label: "Mint", value: "light" },
      ],
    }),
    as: blockSelectField<HeroTitleLevel>({
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
    showAuthor: {
      type: "radio",
      label: "Show author",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
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
    nameSource: {
      type: "radio",
      label: "Author name",
      options: [
        { label: "Username (display name)", value: "displayName" },
        { label: "Full / real name", value: "fullName" },
      ],
    },
    showAvatar: {
      type: "radio",
      label: "Show avatar",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    avatarSizeRem: {
      type: "number",
      label: "Avatar size (rem)",
      min: 1,
      max: 16,
      step: 0.5,
    },
    avatarShape: {
      type: "radio",
      label: "Avatar shape",
      options: [
        { label: "Original", value: "original" },
        { label: "Circle", value: "circle" },
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
    titleColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Title color",
      options: TEXT_COLOR_OPTIONS,
    }),
    titleColorCustom: {
      type: "custom",
      label: "Title custom color",
      render: renderHexField("#FFFFFF", "Pick custom title color"),
    },
    authorColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Author color",
      options: TEXT_COLOR_OPTIONS,
    }),
    authorColorCustom: {
      type: "custom",
      label: "Author custom color",
      render: renderHexField("#FFFFFF", "Pick custom author color"),
    },
    dateColorPreset: blockSelectField<HeroTitleTextColor>({
      label: "Date color",
      options: TEXT_COLOR_OPTIONS,
    }),
    dateColorCustom: {
      type: "custom",
      label: "Date custom color",
      render: renderHexField("#FFFFFF", "Pick custom date color"),
    },
    rounded: {
      type: "radio",
      label: "Round corners",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    paddingYRem: {
      type: "number",
      label: "Vertical padding (rem)",
      min: 0,
      max: 16,
      step: 0.5,
    },
  },
  defaultProps: {
    imageUrl: "",
    imageAlt: "",
    overlayColor: "black",
    as: "h1",
    align: "center",
    showAuthor: true,
    nameSource: "displayName",
    showAvatar: true,
    avatarSizeRem: 3,
    avatarShape: "circle",
    showDate: true,
    titleColorPreset: "auto",
    titleColorCustom: "#FFFFFF",
    authorColorPreset: "auto",
    authorColorCustom: "#FFFFFF",
    dateColorPreset: "auto",
    dateColorCustom: "#FFFFFF",
    rounded: false,
    paddingYRem: 3,
    linkAuthor: true,
  },
  // Hide author/avatar/color sub-fields when the parent toggle is off
  // or the preset isn't "custom". Values persist in puckData so toggling
  // back restores prior picks. Same pattern as `Hero.tsx` / `PostMeta.tsx`.
  resolveFields: (data, { fields }) => {
    const props = data.props ?? ({} as Partial<HeroTitleProps>);
    const hide: Array<keyof HeroTitleProps> = [];
    if (props.showAuthor === false) {
      hide.push("nameSource", "linkAuthor", "authorColorPreset", "authorColorCustom");
    }
    if (props.showAvatar === false) {
      hide.push("avatarSizeRem", "avatarShape");
    }
    if (props.showDate === false) {
      hide.push("dateColorPreset", "dateColorCustom");
    }
    if (props.titleColorPreset !== "custom") hide.push("titleColorCustom");
    if (props.authorColorPreset !== "custom") hide.push("authorColorCustom");
    if (props.dateColorPreset !== "custom") hide.push("dateColorCustom");
    if (hide.length === 0) return fields;
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !hide.includes(key as keyof HeroTitleProps),
      ),
    );
    return filtered as typeof fields;
  },
  render: ({
    imageUrl,
    imageAlt,
    overlayColor,
    as,
    align,
    showAuthor,
    nameSource,
    showAvatar,
    avatarSizeRem,
    avatarShape,
    showDate,
    titleColorPreset,
    titleColorCustom,
    authorColorPreset,
    authorColorCustom,
    dateColorPreset,
    dateColorCustom,
    rounded,
    paddingYRem,
    linkAuthor,
    puck,
  }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard
          name="HeroTitle"
          title="Hero Title"
          description="Shows the post or page title in a hero layout with optional author and date."
        />
      );
    }

    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const post = md.post;
    const page = md.page;
    const title = post?.title ?? page?.title ?? "";
    if (!title) return <></>;

    const author = md.postAuthor ?? md.pageAuthor ?? null;
    const publishedAt = post?.publishedAt ?? page?.publishedAt ?? null;

    // Defaults guard against older saved blocks that predate any of
    // these fields. Mirror `defaultProps` so existing data renders the
    // same as a fresh drop.
    const safeAs: HeroTitleLevel = as ?? "h1";
    const safeAlign: HeroTitleAlign = align ?? "center";
    const safeOverlay: HeroTitleOverlayColor = overlayColor ?? "black";
    const safeNameSource: HeroTitleNameSource = nameSource ?? "displayName";
    const safeAvatarShape: HeroTitleAvatarShape = avatarShape ?? "circle";
    const safeAvatarSize =
      typeof avatarSizeRem === "number" && avatarSizeRem > 0
        ? avatarSizeRem
        : 3;

    // Background image priority: explicit `imageUrl` first, then the
    // post's featured image, then nothing. Pages have no featured image
    // on `PageDetail`, so the fallback only kicks in on post templates.
    const effectiveImageUrl = imageUrl || post?.featuredImage || "";
    const hasImage = effectiveImageUrl.length > 0;
    const overlayDark = OVERLAY_IS_DARK[safeOverlay];
    const autoTitleClass = hasImage
      ? overlayDark
        ? "text-white"
        : "text-brand-navy"
      : "text-brand-navy";
    const autoMetaClass = hasImage
      ? overlayDark
        ? "text-white/90"
        : "text-brand-navy/80"
      : "text-slate-500";
    const titleColor = resolveTextColor(
      titleColorPreset,
      titleColorCustom,
      autoTitleClass,
    );
    const authorColor = resolveTextColor(
      authorColorPreset,
      authorColorCustom,
      autoMetaClass,
    );
    const dateColor = resolveTextColor(
      dateColorPreset,
      dateColorCustom,
      autoMetaClass,
    );

    // Resolve the visible author name. Full-name falls back to display
    // name when the profile hasn't filled fullName, matching
    // `AuthorName.tsx`.
    const fullName = author?.fullName?.trim();
    const authorName = author
      ? safeNameSource === "fullName" && fullName
        ? fullName
        : author.displayName
      : "";
    // Older saves predate the toggle — default to true so existing
    // post templates keep their byline link.
    const safeLinkAuthor = linkAuthor !== false;
    const authorHref =
      safeLinkAuthor && author?.username ? `/author/${author.username}` : null;

    const dateFormat = md.display?.dateFormat ?? DEFAULT_DATE_FORMAT;
    const timezone = md.display?.timezone ?? DEFAULT_TIMEZONE;
    const dateText = publishedAt
      ? formatDate(parseSqliteUtc(publishedAt), dateFormat, timezone)
      : null;

    const TitleTag = safeAs;
    const safePaddingY =
      typeof paddingYRem === "number" && paddingYRem >= 0 ? paddingYRem : 3;
    const innerStyle: CSSProperties = {
      paddingTop: `${safePaddingY}rem`,
      paddingBottom: `${safePaddingY}rem`,
    };
    const safeRounded = rounded === true;
    const avatarStyle: CSSProperties = {
      width: `${safeAvatarSize}rem`,
      maxWidth: "100%",
    };
    const avatarShapeClass =
      safeAvatarShape === "circle"
        ? "rounded-full aspect-square overflow-hidden bg-slate-100"
        : "";
    const avatarUrl = showAvatar ? (author?.avatarUrl ?? null) : null;

    const sectionClass = `np-hero-title not-prose relative mb-6 overflow-hidden bg-slate-100 ${safeRounded ? "rounded-2xl" : ""}`;

    return (
      <section className={sectionClass}>
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={effectiveImageUrl}
            alt={imageAlt}
            className="absolute inset-0 m-0 h-full w-full object-cover object-center"
          />
        ) : null}
        {hasImage && safeOverlay !== "none" ? (
          <div
            className={`absolute inset-0 ${OVERLAY_BG[safeOverlay]}`}
            aria-hidden="true"
          />
        ) : null}
        <div
          className={`relative z-10 flex flex-col justify-center gap-4 px-8 md:px-12 ${ALIGN_ITEMS[safeAlign]}`}
          style={innerStyle}
        >
          <TitleTag
            className={`max-w-3xl ${SIZE_CLASS[safeAs]} ${titleColor.className}`}
            style={titleColor.style}
          >
            {title}
          </TitleTag>
          {avatarUrl ? (
            <div className={avatarShapeClass} style={avatarStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt=""
                className={
                  safeAvatarShape === "circle"
                    ? "h-full w-full object-cover object-center"
                    : "block w-full h-auto"
                }
              />
            </div>
          ) : null}
          {(showAuthor && authorName) || (showDate && dateText) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {showAuthor && authorName ? (
                <span className={authorColor.className} style={authorColor.style}>
                  {authorHref ? (
                    <a href={authorHref} className="text-inherit no-underline hover:underline">
                      {authorName}
                    </a>
                  ) : (
                    authorName
                  )}
                </span>
              ) : null}
              {showAuthor && authorName && showDate && dateText ? (
                <span aria-hidden className={authorColor.className} style={authorColor.style}>
                  ·
                </span>
              ) : null}
              {showDate && dateText ? (
                <time
                  dateTime={publishedAt ?? undefined}
                  className={dateColor.className}
                  style={dateColor.style}
                >
                  {dateText}
                </time>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    );
  },
};

export const HeroTitleBlock: Omit<RegisteredBlock, "source"> = {
  name: "HeroTitle",
  config: HeroTitle,
  surfaces: [
    "template-single-post",
    "template-single-pillar",
    "template-single-page",
  ],
  category: "Template",
};
