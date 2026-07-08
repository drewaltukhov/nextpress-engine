import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { registerCache, getCached, invalidateCache } from "@core/cache/plugin-cache";
import type { WeatherData, GeoResult, ForecastDay } from "./types";
import { decodeWeather } from "./types";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cacheRegistered = false;

/**
 * Ensure the weather cache is registered. Safe to call multiple times.
 * Reads lat/lon/units from settings lazily on each fetch.
 */
function ensureCacheRegistered(db: DbClient): void {
  if (cacheRegistered) return;
  cacheRegistered = true;

  registerCache<WeatherData>({
    key: "weather",
    ttlMs: CACHE_TTL_MS,
    settingsDataKey: "weather.cached_data",
    settingsTimestampKey: "weather.last_fetched",
    fetcher: async () => {
      const [lat, lon, units, city] = await Promise.all([
        getSetting<number>(db, "weather.latitude"),
        getSetting<number>(db, "weather.longitude"),
        getSetting<string>(db, "weather.units"),
        getSetting<string>(db, "weather.city"),
      ]);
      const resolvedUnits = (units === "celsius" ? "celsius" : "fahrenheit") as "fahrenheit" | "celsius";
      const data = await fetchWeather(lat ?? 40.7128, lon ?? -74.006, resolvedUnits);
      if (data) data.city = city ?? "New York";
      return data;
    },
  });
}

export async function geocodeCity(query: string): Promise<GeoResult[]> {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results || !Array.isArray(data.results)) return [];
  return data.results.map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ""),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    country: String(r.country ?? ""),
    admin1: r.admin1 ? String(r.admin1) : undefined,
  }));
}

export async function fetchWeather(
  lat: number,
  lon: number,
  units: "fahrenheit" | "celsius"
): Promise<WeatherData | null> {
  const tempUnit = units === "fahrenheit" ? "fahrenheit" : "celsius";
  const windUnit = units === "fahrenheit" ? "mph" : "kmh";
  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}` +
    `&timezone=auto&forecast_days=5`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const current = data.current;
  const daily = data.daily;
  if (!current || !daily) return null;

  const code = Number(current.weather_code ?? 0);
  const { icon, description } = decodeWeather(code);

  // Slots 1..4 of the daily arrays = next four days (slot 0 = today, skipped).
  const forecast: ForecastDay[] = [];
  const dates: unknown[] = Array.isArray(daily.time) ? daily.time : [];
  const codes: unknown[] = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const highs: unknown[] = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lows: unknown[] = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  for (let i = 1; i <= 4; i++) {
    if (dates[i] === undefined) break;
    const dCode = Number(codes[i] ?? 0);
    const decoded = decodeWeather(dCode);
    forecast.push({
      date: String(dates[i]),
      weatherCode: dCode,
      icon: decoded.icon,
      description: decoded.description,
      high: Math.round(Number(highs[i] ?? current.temperature_2m)),
      low: Math.round(Number(lows[i] ?? current.temperature_2m)),
    });
  }

  return {
    temperature: Math.round(Number(current.temperature_2m)),
    weatherCode: code,
    humidity: Math.round(Number(current.relative_humidity_2m)),
    windSpeed: Math.round(Number(current.wind_speed_10m)),
    high: Math.round(Number(daily.temperature_2m_max?.[0] ?? current.temperature_2m)),
    low: Math.round(Number(daily.temperature_2m_min?.[0] ?? current.temperature_2m)),
    units,
    description,
    icon,
    city: "",
    forecast,
  };
}

/**
 * Get weather data with stale-while-revalidate caching.
 * Returns cached data immediately if available (even if stale),
 * refreshes in the background.
 */
export async function getCachedOrFresh(db: DbClient): Promise<WeatherData | null> {
  ensureCacheRegistered(db);
  return getCached<WeatherData>("weather", db);
}

/**
 * Clear the weather cache (called when settings change).
 */
export function clearWeatherCache(): void {
  invalidateCache("weather");
}
