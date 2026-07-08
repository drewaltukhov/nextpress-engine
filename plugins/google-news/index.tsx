import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings, getSetting } from "@core-plugins/settings/registry";
import { getCachedOrFreshHeadlines } from "./service";
import { GoogleNewsWidget } from "./GoogleNewsWidget";
import { NewsRefreshButton } from "./NewsRefreshButton";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_HEADLINE_COUNT,
  DEFAULT_LANGUAGE,
  DEFAULT_REFRESH_INTERVAL_MIN,
  LANGUAGES,
  MAX_HEADLINE_COUNT,
  MAX_REFRESH_INTERVAL_MIN,
  MIN_HEADLINE_COUNT,
  MIN_REFRESH_INTERVAL_MIN,
  type NewsHeadline,
} from "./types";

interface GoogleNewsWidgetData {
  headlines: NewsHeadline[];
  country: string;
  showDescription: boolean;
}

function GoogleNewsCard({ data }: { data: GoogleNewsWidgetData }) {
  return (
    <GoogleNewsWidget
      headlines={data.headlines}
      country={data.country}
      showDescription={data.showDescription}
    />
  );
}

const countryCodes = COUNTRIES.map((c) => c.code) as [string, ...string[]];
// Empty string means "Auto / country's default" — see types.ts LANGUAGE_AUTO.
const languageCodes = ["", ...LANGUAGES.map((l) => l.code)] as [string, ...string[]];

export default function register(api: PluginAPI): void {
  api.dashboard.registerWidget<GoogleNewsWidgetData>({
    slug: "google-news.headlines",
    title: "Google News",
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 3 },
    maxSize: { w: 12, h: 12 },
    Component: GoogleNewsCard,
    HeaderActions: NewsRefreshButton,
    fetch: async ({ db }) => {
      const [headlines, country, showDescription] = await Promise.all([
        getCachedOrFreshHeadlines(db),
        getSetting<string>(db, "google-news.country"),
        getSetting<boolean>(db, "google-news.show_description"),
      ]);
      return {
        headlines,
        country: country ?? DEFAULT_COUNTRY,
        showDescription: showDescription ?? false,
      };
    },
  });

  defineSettings([
    {
      key: "google-news.country",
      group: "Google News",
      label: "Country edition",
      schema: z.enum(countryCodes),
      defaultValue: DEFAULT_COUNTRY,
      scope: "private",
    },
    {
      key: "google-news.language",
      group: "Google News",
      label: "Language override (empty = country default)",
      schema: z.enum(languageCodes),
      defaultValue: DEFAULT_LANGUAGE,
      scope: "private",
    },
    {
      key: "google-news.refresh_interval_min",
      group: "Google News",
      label: "Refresh interval (minutes)",
      schema: z.number().int().min(MIN_REFRESH_INTERVAL_MIN).max(MAX_REFRESH_INTERVAL_MIN),
      defaultValue: DEFAULT_REFRESH_INTERVAL_MIN,
      scope: "private",
    },
    {
      key: "google-news.headline_count",
      group: "Google News",
      label: "Headlines to show",
      schema: z.number().int().min(MIN_HEADLINE_COUNT).max(MAX_HEADLINE_COUNT),
      defaultValue: DEFAULT_HEADLINE_COUNT,
      scope: "private",
    },
    {
      key: "google-news.show_description",
      group: "Google News",
      label: "Show source and time under each headline",
      schema: z.boolean(),
      defaultValue: false,
      scope: "private",
    },
    {
      key: "google-news.cached_data",
      group: "Google News",
      label: "Cached headlines payload",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "google-news.last_fetched",
      group: "Google News",
      label: "Last fetched timestamp",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
  ]);
}
