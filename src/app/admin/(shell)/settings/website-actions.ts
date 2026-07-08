"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

export interface WebsiteSettings {
  title: string;
  tagline: string;
  url: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const [title, tagline, url, timezone, dateFormat, timeFormat] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    getSetting<string>(db(), "site.url"),
    getSetting<string>(db(), "site.timezone"),
    getSetting<string>(db(), "site.date_format"),
    getSetting<string>(db(), "site.time_format"),
  ]);
  return {
    title: title ?? "",
    tagline: tagline ?? "",
    url: url ?? "",
    timezone: timezone ?? "UTC",
    dateFormat: dateFormat ?? "MMM d, yyyy",
    timeFormat: timeFormat ?? "12h",
  };
}

export async function saveWebsiteSettings(input: WebsiteSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!input.title.trim()) {
    return { ok: false, error: "Site title is required" };
  }

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };

  try {
    await setSetting(db(), "site.title", input.title.trim(), opts);
    await setSetting(db(), "site.tagline", input.tagline.trim(), opts);
    await setSetting(db(), "site.url", input.url.trim(), opts);
    await setSetting(db(), "site.timezone", input.timezone, opts);
    await setSetting(db(), "site.date_format", input.dateFormat, opts);
    await setSetting(db(), "site.time_format", input.timeFormat, opts);

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
