"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { geocodeCity as geocodeCityService, clearWeatherCache } from "@plugins/weather/service";
import type { GeoResult } from "@plugins/weather/types";

export type SaveResult = { ok: true } | { ok: false; error: string };
export type LocationFormat = "city" | "city_state" | "city_country";

// ---------------------------------------------------------------------------
// Read settings
// ---------------------------------------------------------------------------

export interface WeatherSettings {
  city: string;
  cityName: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  units: "fahrenheit" | "celsius";
  showIcons: boolean;
  locationFormat: LocationFormat;
}

export async function getWeatherSettings(): Promise<WeatherSettings> {
  const [city, cityName, state, country, latitude, longitude, units, showIcons, locationFormat] =
    await Promise.all([
      getSetting<string>(db(), "weather.city"),
      getSetting<string>(db(), "weather.city_name"),
      getSetting<string>(db(), "weather.state"),
      getSetting<string>(db(), "weather.country"),
      getSetting<number>(db(), "weather.latitude"),
      getSetting<number>(db(), "weather.longitude"),
      getSetting<string>(db(), "weather.units"),
      getSetting<boolean>(db(), "weather.show_icons"),
      getSetting<string>(db(), "weather.location_format"),
    ]);

  return {
    city: city ?? "New York",
    cityName: cityName ?? "New York",
    state: state ?? "New York",
    country: country ?? "United States",
    latitude: latitude ?? 40.7128,
    longitude: longitude ?? -74.006,
    units: (units === "celsius" ? "celsius" : "fahrenheit") as "fahrenheit" | "celsius",
    showIcons: showIcons ?? true,
    locationFormat: (locationFormat as LocationFormat) ?? "city",
  };
}

// ---------------------------------------------------------------------------
// Save — Settings tab (location + units)
// ---------------------------------------------------------------------------

export interface SaveLocationInput {
  cityName: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  units: "fahrenheit" | "celsius";
}

export async function saveLocationSettings(input: SaveLocationInput): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change weather settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const actorId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: actorId };

  try {
    await setSetting(db(), "weather.city_name", input.cityName.trim(), opts);
    await setSetting(db(), "weather.state", input.state.trim(), opts);
    await setSetting(db(), "weather.country", input.country.trim(), opts);
    await setSetting(db(), "weather.city", input.cityName.trim(), opts);
    await setSetting(db(), "weather.latitude", input.latitude, opts);
    await setSetting(db(), "weather.longitude", input.longitude, opts);
    await setSetting(db(), "weather.units", input.units, opts);
    // Clear both in-memory and DB cache
    clearWeatherCache();
    await setSetting(db(), "weather.cached_data", "", opts);
    await setSetting(db(), "weather.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "weather",
      diff: { city: input.cityName, units: input.units },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/plugins/weather");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save — Appearance tab (icons + location format)
// ---------------------------------------------------------------------------

export interface SaveAppearanceInput {
  showIcons: boolean;
  locationFormat: LocationFormat;
}

export async function saveAppearanceSettings(input: SaveAppearanceInput): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change weather settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const actorId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: actorId };

  try {
    await setSetting(db(), "weather.show_icons", input.showIcons, opts);
    await setSetting(db(), "weather.location_format", input.locationFormat, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "weather",
      diff: { showIcons: input.showIcons, locationFormat: input.locationFormat },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/plugins/weather");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Geocode city search
// ---------------------------------------------------------------------------

export async function searchCity(query: string): Promise<GeoResult[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!query.trim()) return [];
  return geocodeCityService(query.trim());
}

// ---------------------------------------------------------------------------
// Save location from browser geolocation
// ---------------------------------------------------------------------------

export async function saveDetectedLocation(
  latitude: number,
  longitude: number
): Promise<{ ok: true; city: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const results = await geocodeCityService(`${latitude.toFixed(2)},${longitude.toFixed(2)}`);
  const city = results.length > 0 ? results[0].name : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  return { ok: true, city };
}

// ---------------------------------------------------------------------------
// Manual weather refresh (dashboard widget refresh button)
// ---------------------------------------------------------------------------

export async function refreshWeather(): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const actorId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: actorId };

  // Bust both layers: in-memory map plus the DB-persisted snapshot so the
  // next render does a fresh Open-Meteo fetch instead of returning stale.
  clearWeatherCache();
  try {
    await setSetting(db(), "weather.cached_data", "", opts);
    await setSetting(db(), "weather.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cache clear failed" };
  }

  revalidatePath("/admin");
  return { ok: true };
}
