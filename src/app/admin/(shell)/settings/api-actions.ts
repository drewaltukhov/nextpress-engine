"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

export interface ApiSettings {
  tokenDefaultTtlDays: number;
  corsAllowedOrigins: string;
  rateLimitPerMinute: number;
  logTokenIntrospection: boolean;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function getApiSettings(): Promise<ApiSettings> {
  const [tokenDefaultTtlDays, corsAllowedOrigins, rateLimitPerMinute, logTokenIntrospection] =
    await Promise.all([
      getSetting<number>(db(), "api.token_default_ttl_days"),
      getSetting<string>(db(), "api.cors_allowed_origins"),
      getSetting<number>(db(), "api.rate_limit_per_minute"),
      getSetting<boolean>(db(), "api.log_token_introspection"),
    ]);

  return {
    tokenDefaultTtlDays: tokenDefaultTtlDays ?? 90,
    corsAllowedOrigins: corsAllowedOrigins ?? "",
    rateLimitPerMinute: rateLimitPerMinute ?? 60,
    logTokenIntrospection: logTokenIntrospection ?? false,
  };
}

export async function saveApiSettings(input: ApiSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change API settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };
  try {
    await setSetting(db(), "api.token_default_ttl_days", input.tokenDefaultTtlDays, opts);
    await setSetting(db(), "api.cors_allowed_origins", input.corsAllowedOrigins, opts);
    await setSetting(db(), "api.rate_limit_per_minute", input.rateLimitPerMinute, opts);
    await setSetting(db(), "api.log_token_introspection", input.logTokenIntrospection, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.api.update",
      targetType: "settings",
      targetId: "api",
      diff: input,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
