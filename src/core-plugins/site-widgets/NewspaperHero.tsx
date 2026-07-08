import type { ComponentConfig, CustomField } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { generateMockPosts } from "./newspaper/mock-posts";
import { BlockFieldLabel } from "@core/blocks/BlockFieldLabel";
import { TopicMultiPicker } from "@core-plugins/topics/components/TopicMultiPicker";
import { PillarMultiPicker } from "@core-plugins/posts/components/PillarMultiPicker";
import { blockSelectField } from "@core/blocks/BlockSelect";
import { NewspaperFeaturedCard, NewspaperSmallCard } from "./newspaper/cards";
import type { NewspaperPost, NewspaperWidgetConfig } from "./newspaper/types";
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

export interface NewspaperHeroProps {
  type: "all" | "pillar" | "topic";
  // Multi-pillar scope when `type === "pillar"`. `[]` is the
  // PillarMultiPicker "all checked" sentinel — interpreted here as
  // "all spikes regardless of pillar" so a fresh widget still renders
  // posts instead of silent-failing on a single missing selection.
  pillarIds: number[];
  // Multi-topic scope when `type === "topic"`. `[]` means "all posts"
  // (no topic narrowing) — same anti-silent-fail rationale as pillars.
  topicSlugs: string[];
  limit: number;
  heroLayout: "side" | "stacked";
  showDate: boolean;
  showAuthor: boolean;
  showTopic: boolean;
  // Visual treatment. "overlays" paints the title + meta over the
  // image with the optional tint controlled by `overlayColor` (the
  // legacy look). "cards" renders a plain image with the title + meta
  // in a text block below — a more traditional magazine card. The
  // featured slot in this widget always stays "overlays" so the lead
  // post keeps the dominant visual weight regardless of this setting.
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

export const NewspaperHero: ComponentConfig<NewspaperHeroProps> = {
  label: "Hero",
  fields: {
    type: {
      type: "radio",
      label: "Scope",
      options: [
        { label: "All", value: "all" },
        { label: "Topic", value: "topic" },
        { label: "Pillar", value: "pillar" },
      ],
    },
    pillarIds: { type: "custom", label: "Pillars", render: renderPillars },
    topicSlugs: { type: "custom", label: "Topics", render: renderTopics },
    limit: { type: "number", label: "Posts to show", min: 1, max: 8 },
    heroLayout: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Side-by-side (1 big + 2×2 small)", value: "side" },
        { label: "Stacked (featured on top, 2×2 grid of cards below)", value: "stacked" },
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
    type: "all",
    pillarIds: [],
    topicSlugs: [],
    limit: 5,
    heroLayout: "side",
    showDate: true,
    showAuthor: true,
    showTopic: true,
    showExcerpt: false,
    displayStyle: "overlays",
    overlayColor: "black",
  },
  resolveFields: (data, { fields }) => {
    const type = data.props?.type ?? "all";
    const displayStyle = data.props?.displayStyle ?? "overlays";
    const hide = new Set<keyof NewspaperHeroProps>();
    if (type === "all") {
      hide.add("pillarIds");
      hide.add("topicSlugs");
    } else if (type === "pillar") {
      hide.add("topicSlugs");
    } else {
      hide.add("pillarIds");
    }
    // Image overlay only matters in "overlays" mode — hide it in
    // "cards" mode so the inspector doesn't advertise a setting that
    // does nothing for that variant.
    if (displayStyle === "cards") hide.add("overlayColor");
    return Object.fromEntries(
      Object.entries(fields).filter(([key]) => !hide.has(key as keyof NewspaperHeroProps)),
    ) as typeof fields;
  },
  render: (props) => {
    const { type, pillarIds, topicSlugs, limit, heroLayout, showDate, showAuthor, showTopic, showExcerpt, displayStyle, overlayColor, puck } = props;
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    // Theme builder still uses the static BuilderCard placeholder —
    // the structural schematic view doesn't need a real preview, and
    // the BuilderCard reads more clearly on the small zone tiles.
    if (puck?.isEditing && md.themeBuilder) {
      return <BuilderCard name="NewspaperHero" title="Hero" description={"Magazine-style hero — 1 featured + smaller cards."} />;
    }

    // Normalize and sort both id/slug arrays so the SSR collector and
    // the render path agree on a stable cache key regardless of click
    // order. Empty arrays are the "all of that kind" sentinel — see
    // the prop comments above for why.
    const safePillarIds = Array.isArray(pillarIds)
      ? Array.from(new Set(pillarIds.filter((n) => typeof n === "number")))
      : [];
    safePillarIds.sort((a, b) => a - b);
    const safeTopicSlugs = Array.isArray(topicSlugs)
      ? Array.from(new Set(topicSlugs.filter((s) => typeof s === "string" && s.length > 0)))
      : [];
    safeTopicSlugs.sort();
    let cacheKey: string;
    if (type === "pillar") {
      cacheKey =
        safePillarIds.length === 0
          ? "hero:all-spikes"
          : `pillars:${safePillarIds.join(",")}`;
    } else if (type === "topic") {
      cacheKey =
        safeTopicSlugs.length === 0
          ? "hero:all-topic-posts"
          : `topics:${safeTopicSlugs.join(",")}`;
    } else {
      cacheKey = "hero:all";
    }

    const safeLimit = Math.max(1, Math.min(8, Math.floor(limit ?? 5)));
    // Editor preview: mock posts when no SSR data (see NewspaperSection
    // for the rationale — same pattern across all Newspaper widgets).
    const ssrPosts = md.newspaper?.[cacheKey];
    const rawPosts =
      ssrPosts ?? (puck?.isEditing ? generateMockPosts(safeLimit + 1) : []);
    const sliced = rawPosts.slice(0, safeLimit);
    const initialHasMore = rawPosts.length > safeLimit;
    if (sliced.length === 0) {
      return <section className="not-prose mb-8" data-np-toc-skip="" />;
    }
    const [featured, ...smalls] = sliced;
    const dateFormat = md.display?.dateFormat ?? DEFAULT_DATE_FORMAT;
    const timezone = md.display?.timezone ?? DEFAULT_TIMEZONE;
    const safeOverlay: HeroTitleOverlayColor = overlayColor ?? "black";
    const overlayClass = safeOverlay === "none" ? "" : OVERLAY_BG[safeOverlay];
    const overlayIsDark = OVERLAY_IS_DARK[safeOverlay];
    const safeDisplayStyle = displayStyle ?? "overlays";
    // Shared card props. The featured slot overrides `displayStyle` to
    // "overlays" below (spec: NewspaperHero's lead card always keeps
    // the dominant overlay treatment regardless of this setting).
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
    const featuredCardProps = { ...cardProps, displayStyle: "overlays" as const };

    // Build the config for the mounter.
    const widgetId = `newspaper-hero-${type}-${
      type === "pillar"
        ? safePillarIds.length === 0
          ? "all-spikes"
          : safePillarIds.join(",")
        : type === "topic"
          ? safeTopicSlugs.length === 0
            ? "all-topic-posts"
            : safeTopicSlugs.join(",")
          : "all"
    }`;
    // The single-tab mounter only handles single-pillar / single-topic
    // scopes today, so multi-scope modes skip the tab strip (the SSR
    // pre-fetch is the whole story).
    const tabScope =
      type === "pillar" && safePillarIds.length === 1
        ? { type: "pillar" as const, key: String(safePillarIds[0]!) }
        : type === "topic" && safeTopicSlugs.length === 1
          ? { type: "topic" as const, key: safeTopicSlugs[0]! }
          : null;

    const config: NewspaperWidgetConfig = {
      widgetId,
      endpoint: "/api/widgets/newspaper/posts",
      layout: "hero",
      tabs: tabScope ? [{ key: cacheKey, label: cacheKey, scope: tabScope }] : [],
      initialTabKey: cacheKey,
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

    const safeLayout = heroLayout ?? "side";

    return (
      <section
        className="np-newspaper-widget np-newspaper-hero not-prose mb-8"
        data-np-toc-skip=""
        data-np-newspaper-widget=""
        data-np-newspaper-config={JSON.stringify(config)}
      >
        <div data-np-newspaper-content>
          {safeLayout === "stacked" ? (
            <div className="space-y-2">
              <NewspaperFeaturedCard post={featured!} size="hero" aspectOverride="16 / 9" {...featuredCardProps} />
              {smalls.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {smalls.map((p) => (
                    <NewspaperSmallCard key={p.id} post={p} aspect="rectangle" {...cardProps} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            // Side layout: featured on the left occupies both rows; the
            // right column holds a nested 2×2 grid sized via h-full so
            // each small-card row is ~50% of featured's height. Each
            // small card uses aspect="fill" so it grows to the cell's
            // height instead of imposing its own 16:10 aspect.
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <NewspaperFeaturedCard post={featured!} size="hero" {...featuredCardProps} />
              </div>
              {smalls.length > 0 ? (
                <div className="grid h-full grid-cols-1 gap-2 sm:grid-cols-2 sm:grid-rows-2">
                  {smalls.map((p) => (
                    <NewspaperSmallCard key={p.id} post={p} aspect="fill" {...cardProps} />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    );
  },
};

export const NewspaperHeroBlock: Omit<RegisteredBlock, "source"> = {
  name: "NewspaperHero",
  config: NewspaperHero,
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
