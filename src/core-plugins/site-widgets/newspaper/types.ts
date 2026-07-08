/**
 * A post as the Newspaper widgets consume it. Same shape used by the
 * SSR pre-fetcher in render.tsx and by the JSON endpoint
 * `/api/widgets/newspaper/posts`. Keeping one shape on both ends means
 * the mounter renders identical markup whether the data came from
 * initial HTML or a later fetch.
 */
export interface NewspaperPost {
  id: number;
  title: string;
  url: string;
  featuredImage: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  topic: { id: number; name: string; slug: string } | null;
  authorName: string | null;
}

/**
 * Resolved scope for a single widget tab.
 *   - "pillar": key = stringified pillar id (matches the URL/cache contract).
 *   - "topic":  key = topic slug (matches the existing getTopicBySlug path).
 *   - "all":    union of the picked scopes; the endpoint accepts a CSV.
 */
export type NewspaperScope =
  | {
      type: "all";
      // Discriminator so consumers (the mounter URL builder, the
      // cache-key derivation, the JSON endpoint) know which dimension
      // this "all" lives on even when `scopes` is empty (the picker's
      // "all checked" sentinel). Inferring from `scopes[0]?.type` was
      // the previous approach; it failed silently when no scope was
      // picked and the widget rendered an empty section.
      allType: "pillar" | "topic";
      scopes:
        | Array<{ type: "pillar"; key: string }>
        | Array<{ type: "topic"; key: string }>;
    }
  | { type: "pillar"; key: string }
  | { type: "topic"; key: string };

/**
 * Cache key for both the SSR pre-fetch dedupe map (`metadata.newspaper`)
 * and the client mounter's per-host fetch cache. Stable regardless of
 * scope ordering for the "all" case (sorted) so two widgets that pick
 * the same union in different orders share one cache entry.
 *
 * Offset > 0 appends ":offset=N" so the Section block's prev/next pages
 * don't bleed into each other.
 */
export function newspaperCacheKey(scope: NewspaperScope, offset = 0): string {
  let key: string;
  switch (scope.type) {
    case "pillar":
      key = `pillar:${scope.key}`;
      break;
    case "topic":
      key = `topic:${scope.key}`;
      break;
    case "all": {
      // Empty `scopes` is the picker's "all checked" sentinel — no
      // narrowing. Use a stable per-allType key so the mounter and
      // SSR collector agree without having to thread cache keys back
      // and forth.
      const keys = scope.scopes
        .map((s) => s.key)
        .slice()
        .sort();
      key =
        keys.length === 0
          ? `all:${scope.allType}:*`
          : `all:${scope.allType}:${keys.join(",")}`;
      break;
    }
  }
  return offset > 0 ? `${key}:offset=${offset}` : key;
}

/**
 * Tab descriptor: one per visible tab in Section Hero / Section Featured,
 * or one total for Newspaper Section (single scope, no strip).
 */
export interface NewspaperTab {
  key: string;     // cache key for this tab's scope (offset 0)
  label: string;   // user-facing tab label = scope's display name
  scope: NewspaperScope;
}

/**
 * Widget instance config — JSON-encoded into the host's
 * `data-np-newspaper-config` attribute at SSR time and read by the
 * mounter on hydration. The mounter never queries the DB directly;
 * everything it needs is in this blob plus the endpoint URL.
 */
export interface NewspaperWidgetConfig {
  widgetId: string;
  endpoint: "/api/widgets/newspaper/posts";
  layout: "hero" | "section-hero" | "section" | "section-featured";
  tabs: NewspaperTab[];
  initialTabKey: string;
  limit: number;
  showDate: boolean;
  showAuthor: boolean;
  showTopic: boolean;
  showExcerpt: boolean;
  /** Site date format + timezone used by the client mounter to render
   *  dates after a tab/arrow swap. Optional so configs saved before
   *  this field shipped keep rendering — defaults to engine defaults. */
  dateFormat?: import("@core/datetime").DateFormat;
  timezone?: string;
  /** SSR-computed hint: is there at least one more post past the
   *  initial page? Lets the mounter enable/disable the Next arrow
   *  correctly before the user clicks (avoids the "click → 1.5s
   *  skeleton → same page" experience when the initial page happened
   *  to land exactly on the last `limit` posts). */
  initialHasMore?: boolean;
  // Pre-resolved overlay class + dark/light hint so the client mounter
  // doesn't need to import HeroTitle's enum→class mapping. Empty string
  // means no overlay (overlayColor === "none").
  overlayClass: string;
  overlayIsDark: boolean;
  // Visual treatment for cards rendered by the mounter on tab/arrow
  // changes. Mirrors the widget-side `displayStyle` prop. Optional so
  // saved configs from before this field shipped keep rendering — the
  // mounter defaults to "overlays" when absent.
  displayStyle?: "overlays" | "cards";
}
