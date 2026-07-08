import type { ComponentConfig, CustomField } from "@measured/puck";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";
import type { AuthorProfile } from "@core-plugins/users";
import type { PostDetail } from "@core-plugins/posts";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { TopicSlugPickerInput } from "@core-plugins/topics/components/TopicSlugPickerInput";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
} from "@core/datetime";
import {
  type PaginationAlign,
  type PaginationStyle,
  type PaginationType,
} from "./Pagination";
import {
  PostListView,
  type ListThumbnailSize,
  type PostListLimitMode,
  type PostListOptions,
  type RecentPost,
} from "./PostListView";
import {
  resolveSeparatorColor,
  SEPARATOR_COLOR_OPTIONS,
  renderSeparatorHexField,
  type SeparatorColorPreset,
} from "@core-plugins/pages/blocks/Separator";
import { PillarMultiPicker } from "@core-plugins/posts/components/PillarMultiPicker";

/**
 * Grid / list of posts. The renderer (Phase 7's renderActiveTheme)
 * pre-fetches posts indexed by `topicSlug` and stuffs them into
 * `puck.metadata.postsGrid` — the same pattern Galleries and Menus use.
 *
 * The block's `topicSlug` prop ("" = all posts) keys the lookup. On
 * Topic Archive routes, an empty `topicSlug` prop falls back to
 * `metadata.currentTopicSlug` so a generic sidebar PostsGrid lists
 * posts from the current topic.
 */

export type PostsGridLayout = "list" | "grid" | "plain";
export type PostsGridAspect = "rectangle" | "square";
export type PostsGridColumns = 1 | 2 | 3 | 4;

export type PostsGridProps = {
  title: string;
  layout: PostsGridLayout;
  /** When pagination is off, this is a hard item cap (limit mode) or
   *  the approximate number of rows visible before the scroll container
   *  engages (wrap mode). When pagination is on, it's the per-page
   *  count and the renderer fetches every match (up to a safety cap of
   *  200 inside `fetchPostsGridData`). */
  limit: number;
  /** "limit" (default) caps the list at `limit` items. "wrap" renders
   *  every fetched item but constrains the list to ~`limit` visible
   *  rows inside a vertically-scrolling container — matches the
   *  original scrolling `<ul class="scroll-menu">` sidebar
   *  pattern. Ignored for grid layout and when pagination is on; the
   *  field is hidden in the inspector in those cases. */
  limitMode: PostListLimitMode;
  /** Wrap-mode only — pick how the inline scrollbar is rendered.
   *  "default" leaves it to the browser; "custom" styles it as a thin
   *  vertical line (track) with a small rounded thumb, both colored
   *  via the two fields below. */
  wrapScrollerStyle: "default" | "custom";
  /** Hex color for the 1px vertical track line, custom scroller only. */
  wrapScrollerTrackColor: string;
  /** Hex color for the rounded thumb, custom scroller only. */
  wrapScrollerThumbColor: string;
  /** Restrict to posts in a topic slug; "" = all topics. Ignored when
   *  `limitToPillar` is on AND the current route has a post in scope
   *  with a pillar (the resolver falls back to topic only for
   *  standalone posts and routes without a post). */
  topicSlug: string;
  /** Explicit "feed posts from these pillars" filter. `[]` is the
   *  sentinel for "all pillars" — the widget falls through to topic
   *  filtering. A non-empty array narrows the list to spikes whose
   *  parent is in the array. Overrides `topicSlug` when set (but
   *  loses to `limitToPillar` / `filterByAuthor` when those apply). */
  pillarIds: number[];
  /** When on AND the current route is a single post, narrow the list
   *  to siblings of that post under the same pillar:
   *    - spike post   → list is limited to spikes of `post.parentId`
   *    - pillar post  → list is limited to spikes of `post.id`
   *    - standalone   → falls back to the topicSlug filter (or all)
   *  Off (default): legacy behavior, topic-only filtering. */
  limitToPillar: boolean;
  /** When on AND the current route is an author profile (`/author/<u>`),
   *  narrow the list to posts authored by that user. Off elsewhere
   *  (or on routes without an author in scope) → falls through to
   *  the topicSlug filter. Useful for an Author template's "Posts by
   *  this author" widget. */
  filterByAuthor: boolean;
  /** List layout only — render the post's featured image as a small
   *  thumbnail next to the title. Ignored in grid layout (cards always
   *  show a thumbnail). */
  showThumbnail: boolean;
  /** "list" layout only — picks the thumbnail size when `showThumbnail`
   *  is on. "big" matches the historical post-theme override (80px),
   *  "medium" is the original 56px size, "small" is 40px. */
  listThumbnailSize: ListThumbnailSize;
  /** "list" layout only — draw a divider line between rows. Uses the
   *  same color picker as the Separator block. */
  showSeparators: boolean;
  separatorColorPreset: SeparatorColorPreset;
  separatorColorCustom: string;
  /** Show the post's first topic as a chip above the title. Applies to
   *  both list and grid layouts. */
  showTopic: boolean;
  /** Show the post's published date under the title. Applies to every
   *  layout. Defaults to on so existing widget instances keep their
   *  date line. */
  showDate: boolean;
  /** Show the post's excerpt below the title. Off by default. */
  showExcerpt: boolean;
  /** Grid layout only — number of cards per row at the breakpoint. */
  gridColumns: PostsGridColumns;
  /** Grid layout only — featured-image aspect ratio. */
  gridAspect: PostsGridAspect;
  /** Grid layout only — when on, the card image zooms slightly on
   *  hover (alongside the card shadow). Off keeps the image static. */
  gridZoomOnHover: boolean;
  /** When on, slice the fetched list by `?page=N` and render
   *  pagination controls below the grid/list. Off keeps the legacy
   *  hard-capped single-page behavior — useful for sidebar widgets
   *  where pagination would be visually awkward. */
  enablePagination: boolean;
  paginationStyle: PaginationStyle;
  paginationType: PaginationType;
  paginationAlign: PaginationAlign;
};

/**
 * Resolved data filter for a PostsGrid block. One of:
 *   - topic — legacy default; empty slug means "all posts"
 *   - pillar — kicks in when `limitToPillar` is on and a pillar /
 *     spike is in scope
 *   - author — kicks in when `filterByAuthor` is on and an author
 *     is in scope (the `/author/<u>` route)
 */
export type PostsGridFilter =
  | { kind: "topic"; slug: string }
  | { kind: "pillar"; pillarId: number }
  | { kind: "pillars-multi"; pillarIds: number[] }
  | { kind: "author"; authorId: string };

/**
 * Compute the filter for a PostsGrid block instance. Used by both
 * `render.tsx` (server-side spec collection) and the block render
 * (data lookup) so both ends agree on the cache key. Keep this pure —
 * no side effects, no DB calls.
 *
 * Precedence: `filterByAuthor` (when an author is in scope) wins over
 * `limitToPillar` because the author template never has a post /
 * pillar in scope, but if both ever coincide we want the more
 * specific page-context filter. Falls through to the topic filter
 * when neither applies.
 */
export function resolvePostsGridFilter(
  props: Pick<PostsGridProps, "limitToPillar" | "filterByAuthor" | "topicSlug" | "pillarIds">,
  ctx: {
    post?: PostDetail | null;
    currentTopicSlug?: string;
    author?: AuthorProfile | null;
  },
): PostsGridFilter {
  if (props.filterByAuthor && ctx.author) {
    return { kind: "author", authorId: ctx.author.id };
  }
  if (props.limitToPillar && ctx.post) {
    if (ctx.post.postKind === "spike" && ctx.post.parentId) {
      return { kind: "pillar", pillarId: ctx.post.parentId };
    }
    if (ctx.post.postKind === "pillar") {
      return { kind: "pillar", pillarId: ctx.post.id };
    }
    // Standalone or unrecognised — fall through to topic filter so the
    // widget keeps producing something useful instead of going blank.
  }
  // Explicit pillars-multi filter (only when narrowed — `[]` is the
  // "all pillars" sentinel and falls through to the topic filter).
  if (Array.isArray(props.pillarIds) && props.pillarIds.length > 0) {
    // Sort + dedupe so the cache key is stable regardless of click
    // order in the picker.
    const ids = Array.from(new Set(props.pillarIds)).sort((a, b) => a - b);
    return { kind: "pillars-multi", pillarIds: ids };
  }
  return {
    kind: "topic",
    slug: props.topicSlug || ctx.currentTopicSlug || "",
  };
}

/**
 * String key used by `metadata.postsGrid` to index pre-fetched data.
 * Same shape on both sides of the wire — render.tsx writes under this
 * key, the block reads under it.
 */
export function postsGridFilterKey(filter: PostsGridFilter): string {
  switch (filter.kind) {
    case "pillar":
      return `pillar:${filter.pillarId}`;
    case "pillars-multi":
      return `pillars-multi:${filter.pillarIds.join(",")}`;
    case "author":
      return `author:${filter.authorId}`;
    case "topic":
      return `topic:${filter.slug}`;
  }
}

interface PuckMetadataShape {
  postsGrid?: Record<string, RecentPost[]>;
  currentTopicSlug?: string;
  /** Current route's post (if any) — used by the pillar filter. */
  post?: PostDetail | null;
  /** Current route's author profile (set by the `/author/<u>` route)
   *  — used by the author filter. */
  author?: AuthorProfile | null;
  /** 1-based page number for paginated PostsGrid blocks. Routes that
   *  expose pagination read `?page=` and pass it through. Falls back
   *  to 1 when missing. */
  postsPage?: number;
  /** Pathname of the active route (e.g. `/lorem-ipsum/why-do-we-use-it`).
   *  Pagination links rebuild URLs preserving everything else. */
  routePath?: string;
  /** Site-wide date/time/timezone preferences passed by `renderActiveTheme`. */
  display?: { dateFormat: DateFormat; timezone: string };
}

/**
 * Resolve shortcodes inside the PostsGrid `title` field.
 *
 * Supported:
 *   [PillarTitle] → on the Pillar Template, the current pillar's title;
 *                   on the Post Template for a spike, the parent
 *                   pillar's title; everywhere else (standalone post,
 *                   page, author, homepage, …) the token is cut and
 *                   surrounding whitespace collapsed.
 *
 * Unknown tokens are left in place so a typo is visible rather than
 * silently swallowed.
 */
function applyTitleShortcodes(input: string, post: PostDetail | null | undefined): string {
  const replaced = input.replace(/\[(\w+)\]/g, (whole, name: string) => {
    if (name.toLowerCase() === "pillartitle") {
      if (post?.postKind === "pillar" && post.title) return post.title;
      if (post?.postKind === "spike" && post.parentTitle) return post.parentTitle;
      return "";
    }
    return whole;
  });
  return replaced.replace(/\s+/g, " ").trim();
}

const renderTopicSlugField: CustomField<string>["render"] = function TopicSlugFieldRender({
  value,
  onChange,
}) {
  // Puck doesn't auto-render the `label` for `type: "custom"` fields,
  // and Puck's own `FieldLabel` isn't exported from the RSC bundle
  // this file is loaded through. `BlockFieldLabel` is the local
  // server-safe replacement.
  return (
    <BlockFieldLabel label="Topic (optional)">
      <TopicSlugPickerInput
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    </BlockFieldLabel>
  );
};

const renderPillarIdsField: CustomField<number[]>["render"] = function PillarIdsFieldRender({
  value,
  onChange,
}) {
  return (
    <BlockFieldLabel label="Pillars">
      <PillarMultiPicker
        value={
          Array.isArray(value) ? (value.filter((v) => typeof v === "number") as number[]) : []
        }
        onChange={onChange}
      />
    </BlockFieldLabel>
  );
};

// Puck doesn't auto-render the `label` for `type: "custom"` fields, so
// the bare `renderSeparatorHexField` (shared with the Separator block)
// shows a color input with no caption when reused here. Wrap it in
// `BlockFieldLabel` for the wrap-scroller color pickers. Render the
// shared field through a component constant so React treats it as a
// component (safe if `HexField` ever grows hooks).
const SeparatorHexInner = renderSeparatorHexField as unknown as React.FC<{
  value: string;
  onChange: (next: string) => void;
}>;

const renderScrollerTrackColorField: CustomField<string>["render"] = function ScrollerTrackColorFieldRender(props) {
  return (
    <BlockFieldLabel label="Scroller line color">
      <SeparatorHexInner value={typeof props.value === "string" ? props.value : ""} onChange={props.onChange} />
    </BlockFieldLabel>
  );
};

const renderScrollerThumbColorField: CustomField<string>["render"] = function ScrollerThumbColorFieldRender(props) {
  return (
    <BlockFieldLabel label="Scroller thumb color">
      <SeparatorHexInner value={typeof props.value === "string" ? props.value : ""} onChange={props.onChange} />
    </BlockFieldLabel>
  );
};

export const PostsGrid: ComponentConfig<PostsGridProps> = {
  label: "Recent Posts",
  fields: {
    title: {
      type: "text",
      label: "Title (optional) — [PillarTitle] expands to the pillar's title on the Pillar Template, or the parent pillar's title on a spike post (cut elsewhere)",
    },
    layout: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "List", value: "list" },
        { label: "Grid", value: "grid" },
        { label: "Plain list", value: "plain" },
      ],
    },
    limit: { type: "number", label: "Limit", min: 1, max: 50 },
    limitMode: {
      type: "radio",
      label: "Limit mode",
      options: [
        { label: "Limit (cap the list at N)", value: "limit" },
        { label: "Wrap (show all, scroll after N)", value: "wrap" },
      ],
    },
    wrapScrollerStyle: {
      type: "radio",
      label: "Scroller style",
      options: [
        { label: "Browser default", value: "default" },
        { label: "Custom (thin line + rounded thumb)", value: "custom" },
      ],
    },
    wrapScrollerTrackColor: {
      type: "custom",
      label: "Scroller line color",
      render: renderScrollerTrackColorField,
    },
    wrapScrollerThumbColor: {
      type: "custom",
      label: "Scroller thumb color",
      render: renderScrollerThumbColorField,
    },
    topicSlug: {
      type: "custom",
      label: "Topic (optional)",
      render: renderTopicSlugField,
    },
    pillarIds: {
      type: "custom",
      label: "Pillars",
      render: renderPillarIdsField,
    },
    showThumbnail: {
      type: "radio",
      label: "Show thumbnails",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    listThumbnailSize: {
      type: "radio",
      label: "Thumbnail size",
      options: [
        { label: "Big", value: "big" },
        { label: "Medium", value: "medium" },
        { label: "Small", value: "small" },
      ],
    },
    showSeparators: {
      type: "radio",
      label: "Show separators",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    separatorColorPreset: blockSelectField<SeparatorColorPreset>({
      label: "Separator color",
      options: SEPARATOR_COLOR_OPTIONS,
    }),
    separatorColorCustom: {
      type: "custom",
      label: "Custom separator color",
      render: renderSeparatorHexField,
    },
    showTopic: {
      type: "radio",
      label: "Show topic",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
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
    showExcerpt: {
      type: "radio",
      label: "Show excerpt",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    gridColumns: blockSelectField<PostsGridColumns>({
      label: "Items per row",
      options: [
        { label: "1", value: 1 },
        { label: "2", value: 2 },
        { label: "3", value: 3 },
        { label: "4", value: 4 },
      ],
    }),
    gridAspect: {
      type: "radio",
      label: "Thumbnail shape",
      options: [
        { label: "Rectangle (16 / 9)", value: "rectangle" },
        { label: "Square (1 / 1)", value: "square" },
      ],
    },
    gridZoomOnHover: {
      type: "radio",
      label: "Zoom effect",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    limitToPillar: {
      type: "radio",
      label: "Limit to current pillar",
      options: [
        { label: "Off", value: false },
        { label: "On (siblings of the current post)", value: true },
      ],
    },
    filterByAuthor: {
      type: "radio",
      label: "Filter by author (on author pages)",
      options: [
        { label: "Off", value: false },
        { label: "On (posts by this author)", value: true },
      ],
    },
    enablePagination: {
      type: "radio",
      label: "Pagination",
      options: [
        { label: "Off", value: false },
        { label: "On", value: true },
      ],
    },
    paginationStyle: blockSelectField<PaginationStyle>({
      label: "Pagination style",
      options: [
        { label: "Numbered (truncated)", value: "numbered" },
        { label: "Prev / Next only", value: "arrows" },
      ],
    }),
    paginationType: blockSelectField<PaginationType>({
      label: "Pagination control",
      options: [
        { label: "Buttons", value: "buttons" },
        { label: "Plain links", value: "links" },
      ],
    }),
    paginationAlign: blockSelectField<PaginationAlign>({
      label: "Pagination alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    }),
  },
  defaultProps: {
    title: "Recent posts",
    layout: "list",
    limit: 5,
    limitMode: "limit",
    wrapScrollerStyle: "default",
    wrapScrollerTrackColor: "#e2e8f0",
    wrapScrollerThumbColor: "#94a3b8",
    topicSlug: "",
    pillarIds: [],
    showThumbnail: false,
    showTopic: false,
    showDate: true,
    showExcerpt: false,
    gridColumns: 2,
    gridAspect: "rectangle",
    gridZoomOnHover: true,
    listThumbnailSize: "big",
    showSeparators: false,
    separatorColorPreset: "slate-200",
    separatorColorCustom: "#cbd5e1",
    limitToPillar: false,
    filterByAuthor: false,
    enablePagination: false,
    paginationStyle: "numbered",
    paginationType: "buttons",
    paginationAlign: "center",
  },
  // Hide layout-specific fields when they don't apply. Values stay in
  // puckData so flipping back restores the prior pick — same pattern
  // Hero / Spacer use. Also hides pagination-styling knobs when
  // pagination is off so the inspector doesn't dangle three irrelevant
  // controls below the toggle.
  resolveFields: (data, { fields }) => {
    const layout = data.props?.layout ?? "list";
    const enablePagination = data.props?.enablePagination ?? false;
    const hide = new Set<keyof PostsGridProps>();
    const showThumbnail = data.props?.showThumbnail ?? false;
    if (layout === "grid") {
      // Grid: thumbnail is always rendered as the card hero, so the
      // toggle is irrelevant. Grid-only knobs (columns, aspect) are
      // visible.
      hide.add("showThumbnail");
      hide.add("listThumbnailSize");
    } else {
      // List and Plain: hide grid-only knobs but keep the thumbnail
      // toggle — both layouts honour it.
      hide.add("gridColumns");
      hide.add("gridAspect");
      hide.add("gridZoomOnHover");
      // Size picker is "list" + showThumbnail-only. Plain has its own
      // fixed 80px thumb and doesn't honour the picker.
      if (layout !== "list" || !showThumbnail) {
        hide.add("listThumbnailSize");
      }
    }
    // Separator controls only apply to the "list" layout — "plain" has
    // its own bordered card with dividers, "grid" has card breaks.
    const showSeparators = data.props?.showSeparators ?? false;
    const separatorPreset = data.props?.separatorColorPreset ?? "slate-200";
    if (layout !== "list") {
      hide.add("showSeparators");
      hide.add("separatorColorPreset");
      hide.add("separatorColorCustom");
    } else if (!showSeparators) {
      hide.add("separatorColorPreset");
      hide.add("separatorColorCustom");
    } else if (separatorPreset !== "custom") {
      hide.add("separatorColorCustom");
    }
    if (!enablePagination) {
      hide.add("paginationStyle");
      hide.add("paginationType");
      hide.add("paginationAlign");
    }
    // Wrap mode only makes sense for vertical layouts and when
    // pagination isn't already handling the long-list UX.
    const wrapActive =
      data.props?.limitMode === "wrap" && layout !== "grid" && !enablePagination;
    if (layout === "grid" || enablePagination) {
      hide.add("limitMode");
    }
    // Scroller-style controls follow the same gating as limitMode and
    // additionally collapse the two color pickers when the scroller is
    // on its browser default.
    if (!wrapActive) {
      hide.add("wrapScrollerStyle");
      hide.add("wrapScrollerTrackColor");
      hide.add("wrapScrollerThumbColor");
    } else if (data.props?.wrapScrollerStyle !== "custom") {
      hide.add("wrapScrollerTrackColor");
      hide.add("wrapScrollerThumbColor");
    }
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(([key]) => !hide.has(key as keyof PostsGridProps)),
    );
    return filtered as typeof fields;
  },
  render: (props) => {
    const { title, layout, limit, topicSlug, puck } = props;
    if (puck?.isEditing) {
      const bits: string[] = [];
      if (props.limitToPillar) bits.push("Limited to pillar");
      if (props.enablePagination) bits.push(`Paginated · ${props.limit ?? 5}/page`);
      const desc =
        bits.length > 0
          ? `${bits.join(" · ")} · List or grid of posts.`
          : "List or grid of posts. Picks recent posts by default; filter by topic in settings.";
      return <BuilderCard name="PostsGrid" title="Recent Posts" description={desc} />;
    }
    const metadata = (puck?.metadata ?? {}) as PuckMetadataShape;
    const filter = resolvePostsGridFilter(
      {
        limitToPillar: props.limitToPillar ?? false,
        filterByAuthor: props.filterByAuthor ?? false,
        topicSlug,
        pillarIds: Array.isArray(props.pillarIds) ? props.pillarIds : [],
      },
      {
        post: metadata.post ?? null,
        currentTopicSlug: metadata.currentTopicSlug,
        author: metadata.author ?? null,
      },
    );
    const cacheKey = postsGridFilterKey(filter);
    const legacyKey = filter.kind === "topic" ? filter.slug : "";
    const allItems =
      metadata.postsGrid?.[cacheKey] ??
      metadata.postsGrid?.[legacyKey] ??
      [];

    const safeLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.min(50, Math.max(1, Math.floor(limit)))
        : 5;
    const enablePagination = props.enablePagination ?? false;
    // Wrap mode only takes effect for non-grid layouts with pagination
    // off — same conditions PostListView enforces. Outside those, fall
    // back to limit so the slice math below behaves like before.
    const effectiveLimitMode: PostListLimitMode =
      props.limitMode === "wrap" && (layout ?? "list") !== "grid" && !enablePagination
        ? "wrap"
        : "limit";

    let pageItems = allItems;
    let pagination: PostListOptions["pagination"] = null;
    if (enablePagination) {
      const totalPages = Math.max(1, Math.ceil(allItems.length / safeLimit));
      const currentPage = Math.min(
        totalPages,
        Math.max(1, Math.floor(metadata.postsPage ?? 1)),
      );
      const start = (currentPage - 1) * safeLimit;
      pageItems = allItems.slice(start, start + safeLimit);
      const path = metadata.routePath || "";
      const linkFor = (page: number) =>
        page <= 1 ? path || "/" : `${path}?page=${page}`;
      pagination = {
        currentPage,
        totalPages,
        linkFor,
        style: props.paginationStyle ?? "numbered",
        type: props.paginationType ?? "buttons",
        align: props.paginationAlign ?? "center",
      };
    } else if (effectiveLimitMode === "wrap") {
      // Hand the full list down — the scroll container caps visible
      // rows at ~safeLimit; the rest scroll into view.
      pageItems = allItems;
    } else {
      pageItems = allItems.slice(0, safeLimit);
    }

    const showSeparators = props.showSeparators ?? false;
    const separatorColor = showSeparators
      ? resolveSeparatorColor(
          props.separatorColorPreset ?? "slate-200",
          props.separatorColorCustom ?? "#cbd5e1",
        )
      : null;
    const options: PostListOptions = {
      posts: pageItems,
      layout: layout ?? "list",
      limit: safeLimit,
      limitMode: effectiveLimitMode,
      wrapScrollerStyle:
        effectiveLimitMode === "wrap" ? props.wrapScrollerStyle ?? "default" : "default",
      wrapScrollerTrackColor: props.wrapScrollerTrackColor ?? "#e2e8f0",
      wrapScrollerThumbColor: props.wrapScrollerThumbColor ?? "#94a3b8",
      showThumbnail: props.showThumbnail ?? false,
      listThumbnailSize: props.listThumbnailSize ?? "big",
      listSeparatorColor: separatorColor,
      showTopic: props.showTopic ?? false,
      showDate: props.showDate !== false,
      showExcerpt: props.showExcerpt ?? false,
      gridColumns: props.gridColumns ?? 2,
      gridAspect: props.gridAspect ?? "rectangle",
      gridZoomOnHover: props.gridZoomOnHover !== false,
      pagination,
      display: {
        dateFormat: metadata.display?.dateFormat ?? DEFAULT_DATE_FORMAT,
        timezone: metadata.display?.timezone ?? DEFAULT_TIMEZONE,
      },
    };

    const resolvedTitle = title ? applyTitleShortcodes(title, metadata.post ?? null) : "";

    return (
      <section className="np-posts-grid not-prose mb-4" data-np-toc-skip="">
        {resolvedTitle ? (
          <h3 className="mb-3 text-sm font-semibold text-brand-navy">{resolvedTitle}</h3>
        ) : null}
        <PostListView {...options} />
      </section>
    );
  },
};

export const PostsGridBlock: Omit<RegisteredBlock, "source"> = {
  name: "PostsGrid",
  config: PostsGrid,
  surfaces: [
    "sidebar",
    "template-homepage",
    "template-topic-archive",
    "template-single-post",
    "template-single-pillar",
    "template-single-page",
    "template-author",
    "template-search-results",
    "template-not-found",
  ],
  category: "Template",
};
