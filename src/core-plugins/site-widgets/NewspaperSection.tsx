import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { generateMockPosts } from "./newspaper/mock-posts";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";
import { TopicMultiPicker } from "@core-plugins/topics/components/TopicMultiPicker";
import { PillarMultiPicker } from "@core-plugins/posts/components/PillarMultiPicker";
import { renderSeparatorHexField } from "@core-plugins/pages/blocks/Separator";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { SectionHeader } from "./newspaper/SectionHeader";
import { NewspaperSmallCard } from "./newspaper/cards";
import type {
  NewspaperPost,
  NewspaperWidgetConfig,
  NewspaperTab,
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

export interface NewspaperSectionProps {
  type: "pillar" | "topic";
  // Multi-scope across both axes. Empty array is the picker's "all of
  // that kind" sentinel — interpreted here as "all spikes" / "all
  // posts" so the widget never silent-fails on its default state.
  pillarIds: number[];
  topicSlugs: string[];
  limit: number;
  showDate: boolean;
  showAuthor: boolean;
  showTopic: boolean;
  headerBgColor: string;
  // Visual treatment for the card grid. "overlays" paints the title +
  // meta over the image with the optional `overlayColor` tint;
  // "cards" renders a plain image with the title + meta in a text
  // block below.
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
  pillarsBySlug?: Record<string, { id: number; title: string }>;
  pillarsById?: Record<number, { id: number; title: string }>;
  topicsBySlug?: Record<string, { id: number; name: string; slug: string }>;
}

const renderTopics: CustomField<string[]>["render"] = function R({ value, onChange }) {
  const v = Array.isArray(value) ? (value.filter((s) => typeof s === "string") as string[]) : [];
  return (
    <BlockFieldLabel label="Topics">
      <TopicMultiPicker value={v} onChange={onChange} />
    </BlockFieldLabel>
  );
};

const renderPillars: CustomField<number[]>["render"] = function R({ value, onChange }) {
  const v = Array.isArray(value) ? (value.filter((n) => typeof n === "number") as number[]) : [];
  return (
    <BlockFieldLabel label="Pillars">
      <PillarMultiPicker value={v} onChange={onChange} />
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

export const NewspaperSection: ComponentConfig<NewspaperSectionProps> = {
  label: "Section",
  fields: {
    type: {
      type: "radio",
      label: "Scope by",
      options: [
        { label: "Topic", value: "topic" },
        { label: "Pillar", value: "pillar" },
      ],
    },
    pillarIds: { type: "custom", label: "Pillars", render: renderPillars },
    topicSlugs: { type: "custom", label: "Topics", render: renderTopics },
    limit: { type: "number", label: "Posts per page", min: 2, max: 6 },
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
    limit: 3,
    showDate: true,
    showAuthor: true,
    showTopic: true,
    showExcerpt: false,
    headerBgColor: "",
    displayStyle: "overlays",
    overlayColor: "black",
  },
  resolveFields: (data, { fields }) => {
    const type = data.props?.type ?? "topic";
    const displayStyle = data.props?.displayStyle ?? "overlays";
    const hide = new Set<keyof NewspaperSectionProps>();
    if (type === "pillar") hide.add("topicSlugs");
    else hide.add("pillarIds");
    if (displayStyle === "cards") hide.add("overlayColor");
    return Object.fromEntries(
      Object.entries(fields).filter(([key]) => !hide.has(key as keyof NewspaperSectionProps)),
    ) as typeof fields;
  },
  render: (props) => {
    const { type, pillarIds, topicSlugs, limit, showDate, showAuthor, showTopic, showExcerpt, headerBgColor, displayStyle, overlayColor, puck } = props;
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    // Theme builder still uses the static BuilderCard placeholder —
    // the structural schematic view doesn't need a real preview, and
    // the BuilderCard reads more clearly on the small zone tiles.
    if (puck?.isEditing && md.themeBuilder) {
      return <BuilderCard name="NewspaperSection" title="Section" description={"Single scope, 3 horizontal cards, prev/next arrows."} />;
    }
    const safeLimit = Math.max(2, Math.min(6, Math.floor(limit ?? 3)));

    // Normalize + sort the picked ids/slugs for stable cache keys.
    const safePillarIds = Array.isArray(pillarIds)
      ? Array.from(new Set(pillarIds.filter((n) => typeof n === "number")))
      : [];
    safePillarIds.sort((a, b) => a - b);
    const safeTopicSlugs = Array.isArray(topicSlugs)
      ? Array.from(new Set(topicSlugs.filter((s) => typeof s === "string" && s.length > 0)))
      : [];
    safeTopicSlugs.sort();

    let scopeKey: string;
    let label: string;
    if (type === "pillar") {
      if (safePillarIds.length === 0) {
        scopeKey = "section:all-spikes";
        label = "Spikes";
      } else if (safePillarIds.length === 1) {
        const id = safePillarIds[0]!;
        scopeKey = `pillars:${id}`;
        label = md.pillarsById?.[id]?.title ?? `Pillar ${id}`;
      } else {
        scopeKey = `pillars:${safePillarIds.join(",")}`;
        const firstId = safePillarIds[0]!;
        const firstTitle = md.pillarsById?.[firstId]?.title ?? `Pillar ${firstId}`;
        label = `${firstTitle} + ${safePillarIds.length - 1} more`;
      }
    } else {
      if (safeTopicSlugs.length === 0) {
        scopeKey = "section:all-topic-posts";
        label = "All posts";
      } else if (safeTopicSlugs.length === 1) {
        const slug = safeTopicSlugs[0]!;
        scopeKey = `topics:${slug}`;
        label =
          md.topicsBySlug?.[slug]?.name ??
          slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
      } else {
        scopeKey = `topics:${safeTopicSlugs.join(",")}`;
        const firstSlug = safeTopicSlugs[0]!;
        const firstName =
          md.topicsBySlug?.[firstSlug]?.name ??
          firstSlug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        label = `${firstName} + ${safeTopicSlugs.length - 1} more`;
      }
    }

    // Build a tab — NewspaperSection never renders a tab strip, but
    // the mounter reads the scope off `config.tabs[0]` when building
    // its pagination fetch URL. Without this, the prev/next arrows
    // fall back to a default "all topics, no scope" query and 400 on
    // any multi-scope or empty-scope widget.
    let initialTab: NewspaperTab;
    if (type === "pillar") {
      if (safePillarIds.length === 1) {
        initialTab = {
          key: scopeKey,
          label,
          scope: { type: "pillar", key: String(safePillarIds[0]) },
        };
      } else {
        // Includes the empty "all spikes" sentinel and the multi-pick
        // case — both fetched via `type=all&allType=pillar` on the
        // endpoint. Empty `scopes` means "no narrowing" (all spikes).
        initialTab = {
          key: scopeKey,
          label,
          scope: {
            type: "all",
            allType: "pillar",
            scopes: safePillarIds.map((id) => ({ type: "pillar" as const, key: String(id) })),
          },
        };
      }
    } else {
      if (safeTopicSlugs.length === 1) {
        initialTab = {
          key: scopeKey,
          label,
          scope: { type: "topic", key: safeTopicSlugs[0]! },
        };
      } else {
        initialTab = {
          key: scopeKey,
          label,
          scope: {
            type: "all",
            allType: "topic",
            scopes: safeTopicSlugs.map((slug) => ({ type: "topic" as const, key: slug })),
          },
        };
      }
    }

    // Editor preview: when the SSR data pipeline hasn't populated this
    // scope (i.e. we're inside the Puck editor canvas), fall back to
    // mock posts so the user sees the actual rendered layout instead
    // of a placeholder card. Live render passes through unchanged.
    const ssrPosts = md.newspaper?.[scopeKey];
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

    const widgetIdSuffix =
      type === "pillar"
        ? safePillarIds.length === 0
          ? "all-spikes"
          : safePillarIds.join(",")
        : safeTopicSlugs.length === 0
          ? "all-topic-posts"
          : safeTopicSlugs.join(",");
    const config: NewspaperWidgetConfig = {
      widgetId: `newspaper-section-${type}-${widgetIdSuffix}`,
      endpoint: "/api/widgets/newspaper/posts",
      layout: "section",
      tabs: [initialTab],
      initialTabKey: scopeKey,
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
        className="np-newspaper-widget np-newspaper-section not-prose mb-8"
        data-np-toc-skip=""
        data-np-newspaper-widget=""
        data-np-newspaper-config={JSON.stringify(config)}
      >
        <SectionHeader label={label} widgetId={config.widgetId} bgColor={headerBgColor || undefined} tight />
        <div data-np-newspaper-content>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {posts.map((p) => (
              <NewspaperSmallCard key={p.id} post={p} aspect="rectangle" {...cardProps} />
            ))}
          </div>
        </div>
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

export const NewspaperSectionBlock: Omit<RegisteredBlock, "source"> = {
  name: "NewspaperSection",
  config: NewspaperSection,
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
