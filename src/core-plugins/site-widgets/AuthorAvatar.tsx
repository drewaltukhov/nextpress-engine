import type { ComponentConfig } from "@measured/puck";
import type { CSSProperties } from "react";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type AuthorAvatarShape = "original" | "video" | "square" | "circle";
export type AuthorAvatarAlign = "left" | "center" | "right";

export type AuthorAvatarProps = {
  shape: AuthorAvatarShape;
  /** Maximum width in rem. The avatar fills its container up to this
   *  cap, so on a narrow sidebar it shrinks naturally. */
  maxWidthRem: number;
  align: AuthorAvatarAlign;
};

interface PuckMetadataShape {
  author?: AuthorProfile;
}

const SHAPE_DESCRIPTION: Record<AuthorAvatarShape, string> = {
  original: "Original",
  video: "16 / 9",
  square: "Square",
  circle: "Circle",
};

const JUSTIFY_CLASS: Record<AuthorAvatarAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export const AuthorAvatar: ComponentConfig<AuthorAvatarProps> = {
  label: "Author Avatar",
  fields: {
    shape: {
      type: "radio",
      label: "Shape",
      options: [
        { label: "Original", value: "original" },
        { label: "16 / 9", value: "video" },
        { label: "Square", value: "square" },
        { label: "Circle", value: "circle" },
      ],
    },
    maxWidthRem: {
      type: "number",
      label: "Max width (rem)",
      min: 2,
      max: 32,
      step: 0.5,
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
  defaultProps: { shape: "circle", maxWidthRem: 8, align: "left" },
  render: ({ shape, maxWidthRem, align, puck }) => {
    if (puck?.isEditing) {
      return (
        <BuilderCard name="AuthorAvatar"
          title="Author Avatar"
          description={`${SHAPE_DESCRIPTION[shape]} · ${maxWidthRem}rem · ${align}`}
        />
      );
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const url = md.author?.avatarUrl;
    const widthStyle: CSSProperties = { maxWidth: `${maxWidthRem}rem`, width: "100%" };
    // Older saved blocks predate `align` — treat undefined as "left"
    // so existing layouts don't shift.
    const safeAlign: AuthorAvatarAlign = align ?? "left";
    const wrapperClass = `np-author-avatar not-prose mb-4 flex w-full ${JUSTIFY_CLASS[safeAlign]}`;

    if (!url) {
      const initials = (md.author?.displayName ?? "")
        .split(" ")
        .map((p) => p.trim()[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
      return (
        <div className={wrapperClass}>
          <div style={widthStyle}>
            <div
              className={`flex aspect-square w-full items-center justify-center bg-brand-light-green text-brand-navy font-bold ${shape === "circle" ? "rounded-full" : "rounded-lg"}`}
            >
              {initials || "A"}
            </div>
          </div>
        </div>
      );
    }

    if (shape === "original") {
      return (
        <div className={wrapperClass}>
          <div style={widthStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="block w-full h-auto" />
          </div>
        </div>
      );
    }

    const aspectClass = shape === "video" ? "aspect-video" : "aspect-square";
    const radius = shape === "circle" ? "rounded-full" : "rounded-lg";
    return (
      <div className={wrapperClass}>
        <div
          className={`overflow-hidden ${aspectClass} ${radius} bg-slate-100`}
          style={widthStyle}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover object-center" />
        </div>
      </div>
    );
  },
};

export const AuthorAvatarBlock: Omit<RegisteredBlock, "source"> = {
  name: "AuthorAvatar",
  config: AuthorAvatar,
  // Author-only — keeping it off the shared `sidebar` surface stops it
  // leaking into Single Post / Topic Archive / etc. where there's no
  // author profile in the render context to read from.
  surfaces: ["template-author"],
  category: "Template",
  singleton: true,
};
