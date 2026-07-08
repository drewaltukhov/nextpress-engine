"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { clearGoogleNewsCache } from "@plugins/google-news/service";
import {
  COUNTRY_BY_CODE,
  DEFAULT_COUNTRY,
  DEFAULT_HEADLINE_COUNT,
  DEFAULT_LANGUAGE,
  DEFAULT_REFRESH_INTERVAL_MIN,
  LANGUAGE_AUTO,
  LANGUAGE_BY_CODE,
  MAX_HEADLINE_COUNT,
  MAX_REFRESH_INTERVAL_MIN,
  MIN_HEADLINE_COUNT,
  MIN_REFRESH_INTERVAL_MIN,
} from "@plugins/google-news/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface GoogleNewsSettings {
  country: string;
  /** "" = auto / country default. Otherwise a LANGUAGES code. */
  language: string;
  refreshIntervalMin: number;
  headlineCount: number;
  showDescription: boolean;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false as const, error: "Only administrators can change Google News settings" };
  }
  return { ok: true as const, session };
}

// ---------------------------------------------------------------------------
// Read settings (server-side, called from page.tsx)
// ---------------------------------------------------------------------------

export async function getGoogleNewsSettings(): Promise<GoogleNewsSettings> {
  const [country, language, refresh, headlines, showDescription] = await Promise.all([
    getSetting<string>(db(), "google-news.country"),
    getSetting<string>(db(), "google-news.language"),
    getSetting<number>(db(), "google-news.refresh_interval_min"),
    getSetting<number>(db(), "google-news.headline_count"),
    getSetting<boolean>(db(), "google-news.show_description"),
  ]);

  return {
    country: country && COUNTRY_BY_CODE[country] ? country : DEFAULT_COUNTRY,
    language: language && LANGUAGE_BY_CODE[language] ? language : DEFAULT_LANGUAGE,
    refreshIntervalMin: refresh ?? DEFAULT_REFRESH_INTERVAL_MIN,
    headlineCount: headlines ?? DEFAULT_HEADLINE_COUNT,
    showDescription: showDescription ?? false,
  };
}

// ---------------------------------------------------------------------------
// Save — News tab (country + language)
// ---------------------------------------------------------------------------

export interface SaveNewsTabInput {
  country: string;
  language: string;
}

export async function saveNewsTab(input: SaveNewsTabInput): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  if (!COUNTRY_BY_CODE[input.country]) {
    return { ok: false, error: "Unknown country" };
  }
  // "" means "auto / country default" — accept it; otherwise must be in our list.
  if (input.language !== LANGUAGE_AUTO && !LANGUAGE_BY_CODE[input.language]) {
    return { ok: false, error: "Unknown language" };
  }

  const actorId = await resolveUserId(db(), guard.session.user);
  const opts = { updatedBy: actorId };
  try {
    await setSetting(db(), "google-news.country", input.country, opts);
    await setSetting(db(), "google-news.language", input.language, opts);
    clearGoogleNewsCache();
    await setSetting(db(), "google-news.cached_data", "", opts);
    await setSetting(db(), "google-news.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "google-news",
      diff: { country: input.country, language: input.language || "(auto)" },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/google-news");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save — Settings tab (refresh interval, headline count, show description)
// ---------------------------------------------------------------------------

export interface SavePreferencesInput {
  refreshIntervalMin: number;
  headlineCount: number;
  showDescription: boolean;
}

export async function savePreferences(input: SavePreferencesInput): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const writeGuard = await assertWriteable(db());
  if (!writeGuard.ok) return { ok: false, error: writeGuard.error! };

  if (
    !Number.isFinite(input.refreshIntervalMin) ||
    input.refreshIntervalMin < MIN_REFRESH_INTERVAL_MIN ||
    input.refreshIntervalMin > MAX_REFRESH_INTERVAL_MIN
  ) {
    return {
      ok: false,
      error: `Refresh interval must be between ${MIN_REFRESH_INTERVAL_MIN} and ${MAX_REFRESH_INTERVAL_MIN} minutes`,
    };
  }
  if (
    !Number.isFinite(input.headlineCount) ||
    input.headlineCount < MIN_HEADLINE_COUNT ||
    input.headlineCount > MAX_HEADLINE_COUNT
  ) {
    return {
      ok: false,
      error: `Headline count must be between ${MIN_HEADLINE_COUNT} and ${MAX_HEADLINE_COUNT}`,
    };
  }

  const actorId = await resolveUserId(db(), guard.session.user);
  const opts = { updatedBy: actorId };
  try {
    await setSetting(db(), "google-news.refresh_interval_min", Math.round(input.refreshIntervalMin), opts);
    await setSetting(db(), "google-news.headline_count", Math.round(input.headlineCount), opts);
    await setSetting(db(), "google-news.show_description", input.showDescription, opts);
    clearGoogleNewsCache();
    await setSetting(db(), "google-news.cached_data", "", opts);
    await setSetting(db(), "google-news.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "google-news",
      diff: {
        refresh_interval_min: input.refreshIntervalMin,
        headline_count: input.headlineCount,
        show_description: input.showDescription,
      },
    });
  } catch {
    /* audit non-fatal */
  }

  revalidatePath("/admin/plugins/google-news");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manual refresh (dashboard widget refresh button)
// ---------------------------------------------------------------------------

export async function refreshGoogleNews(): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const actorId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: actorId };

  clearGoogleNewsCache();
  try {
    await setSetting(db(), "google-news.cached_data", "", opts);
    await setSetting(db(), "google-news.last_fetched", "", opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cache clear failed" };
  }

  revalidatePath("/admin");
  return { ok: true };
}
