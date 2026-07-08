import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BlockPlaceholder } from "./_placeholder";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type YouTubeProps = {
  url: string;
};

/**
 * Pull the 11-character YouTube video id out of the most common URL shapes:
 *   - youtu.be/ID
 *   - youtube.com/watch?v=ID (with or without other query params)
 *   - youtube.com/embed/ID
 *   - youtube.com/shorts/ID
 *   - bare ID (11 chars, [\w-])
 * Returns null when nothing recognisable is found.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  const patterns: RegExp[] = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export const YouTube: ComponentConfig<YouTubeProps> = {
  label: "YouTube",
  fields: {
    url: {
      type: "text",
      label: "YouTube URL",
    },
  },
  defaultProps: { url: "" },
  render: ({ url, puck }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    const id = extractYouTubeId(url ?? "");
    if (puck?.isEditing && md.themeBuilder) {
      return (
        <BuilderCard name="YouTube"
          title="YouTube"
          description={id ? `Embedded video · ${id}` : "Embedded YouTube video — paste a URL in the inspector."}
        />
      );
    }
    if (!id) {
      return (
        <BlockPlaceholder>
          YouTube — paste a video URL in the Widget Settings panel
        </BlockPlaceholder>
      );
    }
    // youtube-nocookie.com is YouTube's privacy-enhanced embed — no cookies
    // are set unless the viewer plays the video. Sensible default; can be
    // promoted to a per-block toggle if a creator needs the standard domain.
    const src = `https://www.youtube-nocookie.com/embed/${id}`;
    // Capped at max-w-3xl (768px) and centered so embeds don't stretch
    // edge-to-edge inside full-bleed Puck sections. 768px is a comfortable
    // video size that sits slightly wider than typical prose; it doesn't
    // overwhelm short paragraphs above/below it.
    return (
      <div
        className="np-youtube not-prose relative mx-auto mb-4 w-full max-w-3xl overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        <iframe
          src={src}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  },
};

export const YouTubeBlock: Omit<RegisteredBlock, "source"> = {
  name: "YouTube",
  config: YouTube,
  surfaces: [
    "page-content",
    "post-content",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-author",
  ],
  category: "Media",
};
