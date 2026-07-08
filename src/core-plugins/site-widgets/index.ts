/**
 * site-widgets — engine-level block library.
 *
 * Registers every "site widget" block (chrome, page/post/author/topic
 * content placeholders, search, grid, TOC, breadcrumbs, etc.) with
 * the cross-surface registry so any theme can use them.
 *
 * Registration is a side-effect of importing this module. Add
 * `import "@core-plugins/site-widgets";` wherever you need the blocks
 * present in the bundle (server renderer, theme builder client, etc.).
 *
 * To add a new block: create the .tsx file here, export `Foo` and
 * `FooBlock`, then add `FooBlock` to BLOCKS below.
 *
 * Mirrors the pattern in src/core-plugins/pages/blocks/index.ts.
 */
import { registerBlock } from "@core/blocks/registry";
import { SiteLogoBlock } from "./SiteLogo";
import { SearchBoxBlock } from "./SearchBox";
import { SocialIconsBlock } from "./SocialIcons";
import { PostsGridBlock } from "./PostsGrid";
import { NotFoundMessageBlock } from "./NotFoundMessage";
import { PageContentBlock } from "./PageContent";
import { PageTitleBlock } from "./PageTitle";
import { PostTitleBlock } from "./PostTitle";
import { HeroTitleBlock } from "./HeroTitle";
import { PostMetaBlock } from "./PostMeta";
import { PostFeaturedImageBlock } from "./PostFeaturedImage";
import { PostContentBlock } from "./PostContent";
import { TopicArchiveHeaderBlock } from "./TopicArchiveHeader";
import { HomepageMainBlock } from "./HomepageMain";
import { TextBlock } from "./Text";
import { SearchResultsBlock } from "./SearchResults";
import { AuthorAvatarBlock } from "./AuthorAvatar";
import { AuthorNameBlock } from "./AuthorName";
import { AuthorBioBlock } from "./AuthorBio";
import { AuthorLinksBlock } from "./AuthorLinks";
import { AuthorMetaBlock } from "./AuthorMeta";
import { StickyContainerBlock } from "./StickyContainer";
import { TableOfContentsBlock } from "./TableOfContents";
import { BreadcrumbsBlock } from "./Breadcrumbs";
import { NewspaperHeroBlock } from "./NewspaperHero";
import { NewspaperSectionBlock } from "./NewspaperSection";
import { NewspaperSectionHeroBlock } from "./NewspaperSectionHero";
import { NewspaperSectionFeaturedBlock } from "./NewspaperSectionFeatured";

// Category ordering in the builder's widget rail follows first-seen
// registration order (see `@core/blocks/registry`). Listing every
// Template-category block before any Site-category block guarantees
// the "Template" group renders first; the order within each section
// is the natural reading order of the inspector list.
const BLOCKS = [
  // ── Template (post/page/author/content/media) ─────────────────
  HeroTitleBlock,
  PageTitleBlock,
  PostTitleBlock,
  PostMetaBlock,
  PostFeaturedImageBlock,
  PageContentBlock,
  PostContentBlock,
  PostsGridBlock,
  TableOfContentsBlock,
  HomepageMainBlock,
  TopicArchiveHeaderBlock,
  SearchResultsBlock,
  NotFoundMessageBlock,
  BreadcrumbsBlock,
  AuthorAvatarBlock,
  AuthorNameBlock,
  AuthorBioBlock,
  AuthorLinksBlock,
  AuthorMetaBlock,
  // ── Site (chrome — same on every page) ────────────────────────
  SiteLogoBlock,
  SearchBoxBlock,
  SocialIconsBlock,
  TextBlock,
  StickyContainerBlock,
  // ── Newspaper (magazine-style widgets) ────────────────────────
  NewspaperHeroBlock,
  NewspaperSectionBlock,
  NewspaperSectionHeroBlock,
  NewspaperSectionFeaturedBlock,
] as const;

for (const block of BLOCKS) {
  registerBlock({ ...block, source: "core" });
}

// Re-export named helpers that render.tsx pulls directly from PostsGrid.
// After the file move these resolve to the same module; the barrel
// re-export just gives render.tsx a stable import that doesn't depend
// on a direct file path.
export {
  postsGridFilterKey,
  resolvePostsGridFilter,
} from "./PostsGrid";
export type { PostsGridFilter, PostsGridProps } from "./PostsGrid";
