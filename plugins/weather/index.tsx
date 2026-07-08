import type { PluginAPI } from "@core/plugins/api";
import { defineSettings, getSetting } from "@core-plugins/settings/registry";
import { z } from "zod";
import { getCachedOrFresh } from "./service";
import { WeatherWidget } from "./WeatherWidget";
import { WeatherRefreshButton } from "./WeatherRefreshButton";
import type { WeatherData } from "./types";

interface WeatherWidgetData {
  weather: WeatherData | null;
  showIcons: boolean;
  displayCity: string;
}

function WeatherCard({ data }: { data: WeatherWidgetData }) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-brand-green font-bold mb-3">
        🌤 {data.displayCity}
      </div>
      <WeatherWidget data={data.weather} showIcons={data.showIcons} />
    </>
  );
}

export default function register(api: PluginAPI): void {
  api.dashboard.registerWidget<WeatherWidgetData>({
    slug: "weather.current",
    title: "Weather",
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 3 },
    maxSize: { w: 12 },
    Component: WeatherCard,
    HeaderActions: WeatherRefreshButton,
    fetch: async ({ db }) => {
      const [weather, showIcons, locationFormat, cityName, state, country] = await Promise.all([
        getCachedOrFresh(db),
        getSetting<boolean>(db, "weather.show_icons"),
        getSetting<string>(db, "weather.location_format"),
        getSetting<string>(db, "weather.city_name"),
        getSetting<string>(db, "weather.state"),
        getSetting<string>(db, "weather.country")
      ]);
      const city = cityName ?? "New York";
      const displayCity = locationFormat === "city_state" && state
        ? `${city}, ${state}`
        : locationFormat === "city_country" && country
          ? `${city}, ${country}`
          : city;
      return { weather, showIcons: showIcons ?? true, displayCity };
    }
  });

  defineSettings([
    {
      key: "weather.city",
      group: "Weather",
      label: "City",
      schema: z.string().max(200),
      defaultValue: "New York",
      scope: "private",
    },
    {
      key: "weather.latitude",
      group: "Weather",
      label: "Latitude",
      schema: z.number().min(-90).max(90),
      defaultValue: 40.7128,
      scope: "private",
    },
    {
      key: "weather.longitude",
      group: "Weather",
      label: "Longitude",
      schema: z.number().min(-180).max(180),
      defaultValue: -74.006,
      scope: "private",
    },
    {
      key: "weather.units",
      group: "Weather",
      label: "Temperature unit",
      schema: z.enum(["fahrenheit", "celsius"]),
      defaultValue: "fahrenheit",
      scope: "private",
    },
    {
      key: "weather.show_icons",
      group: "Weather",
      label: "Show weather icons",
      schema: z.boolean(),
      defaultValue: true,
      scope: "private",
    },
    {
      key: "weather.location_format",
      group: "Weather",
      label: "Location display format",
      schema: z.enum(["city", "city_state", "city_country"]),
      defaultValue: "city",
      scope: "private",
    },
    {
      key: "weather.city_name",
      group: "Weather",
      label: "City name (raw)",
      schema: z.string().max(200),
      defaultValue: "New York",
      scope: "private",
    },
    {
      key: "weather.state",
      group: "Weather",
      label: "State/Province",
      schema: z.string().max(200),
      defaultValue: "New York",
      scope: "private",
    },
    {
      key: "weather.country",
      group: "Weather",
      label: "Country",
      schema: z.string().max(200),
      defaultValue: "United States",
      scope: "private",
    },
    {
      key: "weather.cached_data",
      group: "Weather",
      label: "Cached weather data",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
    {
      key: "weather.last_fetched",
      group: "Weather",
      label: "Last fetched timestamp",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
    },
  ]);
}
