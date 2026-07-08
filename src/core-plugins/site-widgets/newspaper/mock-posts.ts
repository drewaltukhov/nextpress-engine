import type { NewspaperPost } from "./types";

/**
 * Mock posts used by Newspaper widgets when rendered inside the Puck
 * editor (where the SSR data pipeline that populates
 * `metadata.newspaper[cacheKey]` hasn't run). The shape matches what
 * the live render would receive so the editor preview reflects the
 * actual layout — only the content is placeholder.
 *
 * Titles intentionally read as "Example post N" so authors don't mistake
 * the preview for real posts. Featured images are null (each card-builder
 * falls back to a neutral gradient when absent), keeping the preview
 * lightweight and visually distinct from the live site.
 */
const EXAMPLE_TITLES = [
  "Example post one — a representative headline that wraps",
  "Example post two — short title",
  "Example post three — another representative headline",
  "Example post four — a slightly longer placeholder title",
  "Example post five — short and snappy",
  "Example post six — a final placeholder headline",
  "Example post seven",
  "Example post eight",
  "Example post nine",
  "Example post ten",
];

const EXAMPLE_EXCERPT =
  "Excerpt placeholder — what the post's two-line summary would look like in this slot.";

export function generateMockPosts(count: number): NewspaperPost[] {
  const safeCount = Math.max(0, Math.min(EXAMPLE_TITLES.length, count));
  // Pin the date so the editor preview is stable across re-renders.
  const baseDate = "2026-05-30T12:00:00.000Z";
  return Array.from({ length: safeCount }, (_, i) => ({
    id: -(i + 1),
    title: EXAMPLE_TITLES[i]!,
    url: "#",
    featuredImage: null,
    publishedAt: baseDate,
    excerpt: EXAMPLE_EXCERPT,
    topic: { id: -1, name: "Example topic", slug: "example-topic" },
    authorName: "Example Author",
  }));
}
