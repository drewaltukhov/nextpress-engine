/**
 * Pages block library — registers each block with the cross-surface
 * registry, then exposes the `page-content` Puck config the editor and
 * public renderer consume.
 *
 * Registration is a side-effect of importing this module. The Pages
 * editor (admin) and the public renderer (`/[slug]`) both already
 * import it (directly or via `app/admin/(shell)/pages/puck-config.tsx`),
 * so the registry is populated before any consumer asks for the config.
 *
 * Per-block metadata (name, surfaces, category) lives next to each
 * `ComponentConfig` in its own file (Heading.tsx, RichText.tsx, …) — see
 * the `<Name>Block` exports there. To add a new block: create the file,
 * export `Foo` and `FooBlock`, then add `FooBlock` to `BLOCKS` below.
 *
 * Surface model + the wider themes-and-menus plan:
 *   development_docs/plans/2026-05-07-themes-and-menus.md §3
 */
import { registerBlock, buildPuckConfigForSurface } from "@core/blocks/registry";
// Site widgets (Author*, PostsGrid, Text, etc.) register here too — the
// post editor imports the same `puckConfig` snapshot the page editor
// uses, and several of those widgets opt into the `page-content`
// surface. The server already pulls them in via `layout.tsx →
// discoveredPlugins → themes/<slug> → site-widgets`, but the client
// bundle for the post editor doesn't, so the snapshot captured here
// would contain a different block set on each side and Puck's
// component drawer would render in a different order at SSR vs CSR —
// triggering a hydration mismatch. Pinning the side-effect import
// here guarantees both sides see the same registry state when the
// snapshot is taken.
import "@core-plugins/site-widgets";
// NavMenu opts into `page-content` so it can be dropped into a post
// body. The menus plugin's server-side `register()` triggers this same
// side-effect, but the post-editor client bundle has no reason to pull
// the rest of `@core-plugins/menus` (server-only DB code), so without
// this import the client registry omits NavMenu while the server
// includes it — and Puck's drawer hydration mismatches. Same shape as
// the site-widgets import above; see `menus/blocks.ts` docstring.
import "@core-plugins/menus/blocks";
// Plugin theme blocks register here too — the generated aggregator's
// side-effect imports run before `buildPuckConfigForSurface` below
// captures the registry, so plugin-shipped blocks (e.g. Crypto Beat's
// `Prices`) appear in the page-content puckConfig snapshot.
import "@generated/plugin-blocks";
import { HeadingBlock } from "./Heading";
import { RichTextBlock } from "./RichText";
import { ImageBlock } from "./Image";
import { YouTubeBlock } from "./YouTube";
import { GalleryBlock } from "./Gallery";
import { HeroBlock } from "./Hero";
import { BannerBlock } from "./Banner";
import { ButtonBlock } from "./Button";
import { FAQSectionBlock } from "./FAQSection";
import { TableBlock } from "./Table";
import { SpacerBlock } from "./Spacer";
import { SeparatorBlock } from "./Separator";
import { LayoutBlock } from "./Layout";
import { collectMediaIdsFromHtml } from "./shortcodes";

// Registration order matters for the editor's left-rail layout: the
// registry preserves insertion order, which determines both category
// order (Text → Media → Sections → Layout) and the order of components
// within each category. Keep this list aligned with how the rail should
// read top-to-bottom.
const BLOCKS = [
  HeadingBlock,
  RichTextBlock,
  ImageBlock,
  YouTubeBlock,
  GalleryBlock,
  HeroBlock,
  BannerBlock,
  ButtonBlock,
  FAQSectionBlock,
  TableBlock,
  SpacerBlock,
  SeparatorBlock,
  LayoutBlock,
] as const;

for (const block of BLOCKS) {
  registerBlock({ ...block, source: "core" });
}

export const puckConfig = buildPuckConfigForSurface("page-content");

export { collectFaqItems } from "./FAQSection";
export { collectMediaIdsFromHtml } from "./shortcodes";


/**
 * Walk a Puck data tree and collect every Gallery block's galleryId.
 * Used by the public `/[slug]` route to batch-fetch all referenced
 * gallery details in one round-trip and inject them into Puck metadata
 * so the render fn can show real thumbnails + real layout.
 */
export function collectGalleryIds(
  content: { type?: string; props?: { galleryId?: number | null } }[],
): number[] {
  const ids = new Set<number>();
  for (const block of content) {
    if (block.type === "Gallery") {
      const id = block.props?.galleryId;
      if (typeof id === "number" && Number.isFinite(id)) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Walk a Puck data tree and collect every media id referenced via `[img]`
 * / `[thumb]` shortcodes inside RichText blocks. Mirrors `collectGalleryIds`
 * — public route batch-fetches the media records and injects them into Puck
 * metadata so the RichText render can fill in alt + dimensions.
 */
export function collectShortcodeMediaIds(
  content: { type?: string; props?: { html?: string } }[],
): string[] {
  const ids = new Set<string>();
  for (const block of content) {
    if (block.type !== "RichText") continue;
    const html = block.props?.html;
    if (typeof html !== "string" || html.length === 0) continue;
    for (const id of collectMediaIdsFromHtml(html)) ids.add(id);
  }
  return Array.from(ids);
}
