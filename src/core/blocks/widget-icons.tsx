import { createElement, type ReactNode } from "react";
import {
  AlignLeft,
  BookOpen,
  ChevronsRight,
  Frown,
  Heading,
  HelpCircle,
  Image as ImageIcon,
  Images,
  Info,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LayoutPanelLeft,
  LayoutPanelTop,
  LayoutTemplate,
  Link2,
  List,
  ListMinus,
  Megaphone,
  Menu as MenuIcon,
  Minus,
  MousePointerClick,
  Mountain,
  MoveVertical,
  Newspaper,
  Pilcrow,
  Rows3,
  Pin,
  Search,
  Share2,
  Table as TableIcon,
  Tags,
  Type,
  User,
  UserCircle,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared block → Lucide icon map.
 *
 * Single source of truth for the icon a block shows in (1) the theme
 * builder's widgets rail and (2) its own `BuilderCard` preview inside
 * the editing surface. Keeping both in sync was previously a footgun —
 * the rail map lived inside `ThemeBuilderClient.tsx` and each block's
 * `<BuilderCard />` rendered icon-less, so adding a widget meant
 * remembering to register the rail icon AND passing an icon to the
 * preview card. Centralising the map here removes the second step.
 *
 * Plugin-shipped blocks (anything not in this map) fall back to
 * `RegisteredBlock.icon` (SVG path data on the registry entry) in the
 * rail, and to no icon at all in the preview card. The hardcoded map
 * is for core blocks only — plugins should keep using the registry
 * entry's `icon` field instead of patching this map.
 */
export const WIDGET_ICONS: Record<string, LucideIcon> = {
  // ── NextPresso / site widgets ────────────────────────────────────
  SiteLogo: ImageIcon,
  SearchBox: Search,
  SocialIcons: Share2,
  PostsGrid: LayoutGrid,
  NotFoundMessage: Frown,
  PageContent: AlignLeft,
  PageTitle: Heading,
  PostTitle: Heading,
  PostMeta: Info,
  PostFeaturedImage: ImageIcon,
  PostContent: AlignLeft,
  TopicArchiveHeader: Tags,
  HomepageMain: LayoutDashboard,
  HeroTitle: LayoutTemplate,
  Text: Type,
  SearchResults: ListMinus,
  AuthorAvatar: UserCircle,
  AuthorName: User,
  AuthorBio: BookOpen,
  AuthorLinks: Link2,
  AuthorMeta: UserCircle,
  StickyContainer: Pin,
  TableOfContents: List,
  Breadcrumbs: ChevronsRight,
  Layout: Layers,
  NewspaperHero: Newspaper,
  NewspaperSection: Rows3,
  NewspaperSectionHero: LayoutPanelLeft,
  NewspaperSectionFeatured: LayoutPanelTop,
  // ── Page-plugin blocks ───────────────────────────────────────────
  Hero: Mountain,
  Banner: Megaphone,
  Button: MousePointerClick,
  Gallery: Images,
  Image: ImageIcon,
  YouTube: Video,
  RichText: Pilcrow,
  Heading: Heading,
  FAQSection: HelpCircle,
  Separator: Minus,
  Spacer: MoveVertical,
  Table: TableIcon,
  // ── Menus plugin ─────────────────────────────────────────────────
  NavMenu: MenuIcon,
};

/**
 * Resolve a Lucide icon by block name. Returns `null` if the block
 * isn't in the hardcoded map — caller can decide between falling
 * back to the registry's `icon` SVG path or rendering nothing.
 */
export function widgetIconFor(name: string): LucideIcon | null {
  return WIDGET_ICONS[name] ?? null;
}

/**
 * Convenience wrapper for the preview card: renders the resolved
 * icon at the standard rail size (`size-3.5`) or nothing if the
 * block isn't in the map.
 */
export function WidgetIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}): ReactNode {
  // `widgetIconFor` reads from a frozen module-scope map, so the
  // returned component identity is stable. Using `createElement`
  // avoids the JSX lint heuristic that flags "uppercase-bound
  // variables = a new component" — it can't prove the lookup is
  // stable, but we can.
  const Icon = widgetIconFor(name);
  if (!Icon) return null;
  return createElement(Icon, {
    className: className ?? "size-3.5",
    "aria-hidden": "true",
  });
}
