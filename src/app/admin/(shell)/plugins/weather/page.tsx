import type { Metadata } from "next";
import { getWeatherSettings } from "./actions";
import { WeatherSettingsClient } from "./WeatherSettingsClient";

export const metadata: Metadata = { title: "Weather" };

export default async function WeatherPluginPage() {
  const settings = await getWeatherSettings();
  return <WeatherSettingsClient initial={settings} />;
}
