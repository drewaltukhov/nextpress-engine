import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { generateMockPosts } from "./newspaper/mock-posts";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";
import { PillarMultiPicker } from "@core-plugins/posts/components/PillarMultiPicker";
import { TopicMultiPicker } from "@core-plugins/topics/components/TopicMultiPicker";
import { renderSeparatorHexField } from "@core-plugins/pages/blocks/Separator";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { SectionHeader } from "./newspaper/SectionHeader";
import { NewspaperFeaturedCard, NewspaperListRow } from "./newspaper/cards";
import type {
  NewspaperPost,
  NewspaperTab,
  NewspaperWidgetConfig,
} from "./newspaper/types";
import {
  type HeroTitleOverlayColor,
  OVERLAY_BG,
  OVERLAY_IS_DARK,
} from "./HeroTitle";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
} from "@core/datetime";

export interface NewspaperSectionFeaturedProps {
  type: "pillar" | "topic";
  pillarIds: number[];
  topicSlugs: string[];
  showAllTab: boolean;
  limit: number;
  showDate: boolean;
  showAuthor: boolean;
  showTopic: boolean;
  headerBgColor: string;
  // Overlays vs. cards. Same dichotomy as the other Newspaper widgets;
  // both featured slots and the bottom row grid respect it.
  displayStyle: "overlays" | "cards";
  overlayColor: HeroTitleOverlayColor;
  showExcerpt: boolean;
}

interface PuckMetadataShape {
  /** Set by the theme builder so widgets fall back to a static
   *  BuilderCard placeholder instead of the mock-data preview used
   *  in the post/page editor. */
  themeBuilder?: boolean;
  newspaper?: Record<string, NewspaperPost[]>;
  display?: { dateFormat: DateFormat; timezone: string };
  pillarsById?: Record<number, { id: number; title: string }>;
  topicsBySlug?: Record<string, { id: number; name: string; slug: string }>;
}

const renderPillars: CustomField<number[]>["render"] = function R({ value, onChange }) {
  const v = Array.isArray(value) ? (value.filter((n) => typeof n === "number") as number[]) : [];
  return (
    <BlockFieldLabel label="Pillars (ordered)">
      <PillarMultiPicker value={v} onChange={onChange} />
    </BlockFieldLabel>
  );
};

const renderTopics: CustomField<string[]>["render"] = function R({ value, onChange }) {
  const v = Array.isArray(value) ? (value.filter((s) => typeof s === "string") as string[]) : [];
  return (
    <BlockFieldLabel label="Topics (ordered)">
      <TopicMultiPicker value={v} onChange={onChange} />
    </BlockFieldLabel>
  );
};

const SeparatorHexInner = renderSeparatorHexField as unknown as React.FC<{
  value: string;
  onChange: (next: string) => void;
}>;

const renderHeaderBgColorField: CustomField<string>["render"] = function R(props) {
  return (
    <BlockFieldLabel label="Header background color">
      <SeparatorHexInner value={typeof props.value === "string" ? props.value : ""} onChange={props.onChange} />
    </BlockFieldLabel>
  );
};

function buildTabs(
  props: NewspaperSectionFeaturedProps,
  md: PuckMetadataShape,
): NewspaperTab[] {
  const tabs: NewspaperTab[] = [];
  if (props.type === "pillar") {
    // Empty array = picker "all checked" sentinel — surface as a
    // single synthetic "All" tab so the widget keeps rendering on its
    // default state. SSR collector matches the key below.
    if (props.pillarIds.length === 0) {
      tabs.push({
        key: "section-featured:all-spikes",
        label: "All",
        scope: { type: "all", allType: "pillar", scopes: [] },
      });
    } else {
      for (const id of props.pillarIds) {
        const name = md.pillarsById?.[id]?.title ?? `Pillar ${id}`;
        tabs.push({
          key: `pillar:${id}`,
          label: name,
          scope: { type: "pillar", key: String(id) },
        });
      }
    }
  } else {
    if (props.topicSlugs.length === 0) {
      tabs.push({
        key: "section-featured:all-topic-posts",
        label: "All",
        scope: { type: "all", allType: "topic", scopes: [] },
      });
    } else {
      for (const slug of props.topicSlugs) {
        const name =
          md.topicsBySlug?.[slug]?.name ??
          slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        tabs.push({
          key: `topic:${slug}`,
          label: name,
          scope: { type: "topic", key: slug },
        });
      }
    }
  }
  if (props.showAllTab && tabs.length >= 2) {
    const allScopes = tabs.flatMap<{ type: "pillar" | "topic"; key: string }>((t) => {
      if (t.scope.type === "all") return [];
      return [{ type: t.scope.type, key: t.scope.key }];
    });
    const sortedKeys = allScopes.map((s) => s.key).slice().sort();
    const allKey = `all:${props.type}:${sortedKeys.join(",")}`;
    tabs.push({
      key: allKey,
      label: "All",
      scope:
        props.type === "pillar"
          ? {
              type: "all",
              allType: "pillar",
              scopes: allScopes.filter(
                (s): s is { type: "pillar"; key: string } => s.type === "pillar",
              ),
            }
          : {
              type: "all",
              allType: "topic",
              scopes: allScopes.filter(
                (s): s is { type: "topic"; key: string } => s.type === "topic",
              ),
            },
    });
  }
  return tabs;
}

export const NewspaperSectionFeatured: ComponentConfig<NewspaperSectionFeaturedProps> = {
  label: "Two Featured + Rows Grid",
  fields: {
    type: {
      type: "radio",
      label: "Scope by",
      options: [
        { label: "Topic", value: "topic" },
        { label: "Pillar", value: "pillar" },
      ],
    },
    pillarIds: { type: "custom", label: "Pillars (ordered)", render: renderPillars },
    topicSlugs: { type: "custom", label: "Topics (ordered)", render: renderTopics },
    showAllTab: {
      type: "radio",
      label: "Show 'All' tab",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    limit: { type: "number", label: "Posts per tab", min: 5, max: 10 },
    showDate: {
      type: "radio",
      label: "Show date",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
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
    showTopic: {
      type: "radio",
      label: "Show topic chip",
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
    headerBgColor: {
      type: "custom",
      label: "Header background color",
      render: renderHeaderBgColorField,
    },
    displayStyle: {
      type: "radio",
      label: "Display style",
      options: [
        { label: "Overlays (text on image)", value: "overlays" },
        { label: "Cards (text under image)", value: "cards" },
      ],
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
  },
  defaultProps: {
    type: "topic",
    pillarIds: [],
    topicSlugs: [],
    showAllTab: true,
    limit: 6,
    showDate: true,
    showAuthor: true,
    showTopic: true,
    showExcerpt: false,
    headerBgColor: "",
    displayStyle: "overlays",
    overlayColor: "black",
  },
  resolveFields: (data, { fields }) => {
    const t = data.props?.type ?? "topic";
    const displayStyle = data.props?.displayStyle ?? "overlays";
    const scopes =
      t === "pillar"
        ? Array.isArray(data.props?.pillarIds)
          ? data.props!.pillarIds!.length
          : 0
        : Array.isArray(data.props?.topicSlugs)
          ? data.props!.topicSlugs!.length
          : 0;
    const hide = new Set<keyof NewspaperSectionFeaturedProps>();
    if (t === "pillar") hide.add("topicSlugs");
    else hide.add("pillarIds");
    if (scopes < 2) hide.add("showAllTab");
    if (displayStyle === "cards") hide.add("overlayColor");
    return Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !hide.has(key as keyof NewspaperSectionFeaturedProps),
      ),
    ) as typeof fields;
  },
  render: (props) => {
    const { puck, showDate, showAuthor, showTopic, showExcerpt, limit, headerBgColor, displayStyle, overlayColor } = props;
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    // Theme builder still uses the static BuilderCard placeholder —
    // the structural schematic view doesn't need a real preview, and
    // the BuilderCard reads more clearly on the small zone tiles.
    if (puck?.isEditing && md.themeBuilder) {
      return <BuilderCard name="NewspaperSectionFeatured" title="Two Featured + Rows Grid" description={"Two featured cards on top, 4 thumbnail rows in a two-column grid below. Section heading + tab strip."} />;
    }
    const tabs = buildTabs(props, md);
    if (tabs.length === 0) return <section data-np-toc-skip="" />;

    const safeLimit = Math.max(5, Math.min(10, Math.floor(limit ?? 6)));
    const initialTab = tabs[0]!;
    // Editor preview: mock posts when no SSR data — see NewspaperSection.
    const ssrPosts = md.newspaper?.[initialTab.key];
    const rawPosts =
      ssrPosts ?? (puck?.isEditing ? generateMockPosts(safeLimit + 1) : []);
    const posts = rawPosts.slice(0, safeLimit);
    const initialHasMore = rawPosts.length > safeLimit;
    const dateFormat = md.display?.dateFormat ?? DEFAULT_DATE_FORMAT;
    const timezone = md.display?.timezone ?? DEFAULT_TIMEZONE;
    const safeOverlay: HeroTitleOverlayColor = overlayColor ?? "black";
    const overlayClass = safeOverlay === "none" ? "" : OVERLAY_BG[safeOverlay];
    const overlayIsDark = OVERLAY_IS_DARK[safeOverlay];
    const safeDisplayStyle = displayStyle ?? "overlays";
    const cardProps = {
      showDate,
      showAuthor,
      showTopic,
      showExcerpt: showExcerpt ?? false,
      dateFormat,
      timezone,      overlayClass,
      overlayIsDark,
      displayStyle: safeDisplayStyle,
    };

    const config: NewspaperWidgetConfig = {
      widgetId: `newspaper-section-featured-${props.type}-${tabs[0]!.key}`,
      endpoint: "/api/widgets/newspaper/posts",
      layout: "section-featured",
      tabs,
      initialTabKey: initialTab.key,
      limit: safeLimit,
      showDate,
      showAuthor,
      showTopic,
      showExcerpt: showExcerpt ?? false,
      dateFormat,
      timezone,
      initialHasMore,
      overlayClass,
      overlayIsDark,
      displayStyle: safeDisplayStyle,
    };

    return (
      <section
        className="np-newspaper-widget np-newspaper-section-featured not-prose mb-8"
        data-np-toc-skip=""
        data-np-newspaper-widget=""
        data-np-newspaper-config={JSON.stringify(config)}
      >
        <SectionHeader
          label={initialTab.label}
          tabs={tabs}
          activeTabKey={initialTab.key}
          widgetId={config.widgetId}
          bgColor={headerBgColor || undefined}
        />
        <div data-np-newspaper-content>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {posts.slice(0, 2).map((p, i) => (
                <NewspaperFeaturedCard
                  key={p.id}
                  post={p}
                  size={i === 0 ? "large" : "medium"}
                  {...cardProps}
                />
              ))}
            </div>
            {posts.length > 2 ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {posts.slice(2).map((p) => (
                  <NewspaperListRow key={p.id} post={p} {...cardProps} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {/* Prev/next arrows match NewspaperSection's pattern. The
            mounter wires these by `data-np-newspaper-prev/next` regardless
            of layout — arrows start `disabled` so an unhydrated page
            never advertises pagination it can't perform; the mounter
            re-enables them after hydration based on `lastWasFull` and
            offset. */}
        <div
          className="mt-4 flex items-center justify-end gap-2"
          data-np-newspaper-arrows
        >
          <button
            type="button"
            data-np-newspaper-prev
            aria-label="Newer posts"
            disabled
            className="size-9 border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            data-np-newspaper-next
            aria-label="Older posts"
            disabled
            className="size-9 border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </section>
    );
  },
};

export const NewspaperSectionFeaturedBlock: Omit<RegisteredBlock, "source"> = {
  name: "NewspaperSectionFeatured",
  config: NewspaperSectionFeatured,
  surfaces: [
    "sidebar",
    "post-content",
    "page-content",
    "template-homepage",
    "template-topic-archive",
    "template-single-post",
    "template-single-pillar",
    "template-single-page",
    "template-author",
    "template-search-results",
    "template-not-found",
  ],
  category: "Newspaper",
};
