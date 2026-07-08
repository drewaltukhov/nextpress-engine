"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import {
  listMyTokens,
  createApiToken,
  revokeApiToken,
  VALID_SCOPES,
  type TokenListItem,
} from "@core-plugins/api";

export type SaveResult = { ok: true } | { ok: false; error: string };

const VALID_SCOPE_SET = new Set<string>(VALID_SCOPES);

async function requireAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can manage API tokens" };
  }
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

// ---------------------------------------------------------------------------
// My Tokens tab — list + generate + revoke
// ---------------------------------------------------------------------------

export async function getMyTokens(): Promise<TokenListItem[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const userId = await resolveUserId(db(), session.user);
  return listMyTokens(db(), userId);
}

export interface GenerateTokenInput {
  name: string;
  scopes: string[];
}

export interface GenerateTokenResult {
  ok: true;
  plaintext: string;       // shown once, never returned again
  prefix: string;
  expiresAt: string | null;
}

export async function generateTokenAction(
  input: GenerateTokenInput
): Promise<GenerateTokenResult | { ok: false; error: string }> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  const name = input.name?.trim() ?? "";
  if (!name) return { ok: false, error: "Token name is required" };
  if (name.length > 100) {
    return { ok: false, error: "Token name must be 100 characters or fewer" };
  }

  const scopes = (input.scopes ?? []).filter((s) => VALID_SCOPE_SET.has(s));
  if (scopes.length === 0) {
    return { ok: false, error: "Pick at least one scope" };
  }

  const ttlDays = (await getSetting<number>(db(), "api.token_default_ttl_days")) ?? 90;
  const expiresAt =
    ttlDays > 0
      ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { userId } = guard;

  let result: Awaited<ReturnType<typeof createApiToken>>;
  try {
    result = await createApiToken(db(), {
      userId,
      name,
      scopes,
      expiresAt,
      createdBy: userId,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generate failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "api_tokens.created",
      targetType: "api_token",
      targetId: String(result.id),
      diff: { name, scopes, prefix: result.prefix, expiresAt },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/api-tokens");
  return {
    ok: true,
    plaintext: result.plaintext,
    prefix: result.prefix,
    expiresAt,
  };
}

export async function revokeTokenAction(id: number): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  const { userId } = guard;

  // Defense in depth — only revoke tokens owned by the caller.
  const owned = await db().execute({
    sql: "SELECT id FROM api_tokens WHERE id = ? AND user_id = ? AND tenant_id = 1 LIMIT 1",
    args: [id, userId],
  });
  if (owned.rows.length === 0) {
    return { ok: false, error: "Token not found" };
  }

  try {
    await revokeApiToken(db(), id, { revokedBy: userId, reason: "manual" });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Revoke failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "api_tokens.revoked",
      targetType: "api_token",
      targetId: String(id),
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/api-tokens");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings tab — default TTL + default rate limit
// ---------------------------------------------------------------------------

export interface ApiTokensSettings {
  defaultTtlDays: number;        // 0 = never expires
  defaultRateLimit: number;      // requests / minute
}

export async function getApiTokensSettings(): Promise<ApiTokensSettings> {
  const [ttl, rate] = await Promise.all([
    getSetting<number>(db(), "api.token_default_ttl_days"),
    getSetting<number>(db(), "api.rate_limit_per_minute"),
  ]);
  return {
    defaultTtlDays: ttl ?? 90,
    defaultRateLimit: rate ?? 60,
  };
}

export async function saveApiTokensSettings(
  input: ApiTokensSettings
): Promise<SaveResult> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };

  if (
    !Number.isInteger(input.defaultTtlDays) ||
    input.defaultTtlDays < 0 ||
    input.defaultTtlDays > 3650
  ) {
    return { ok: false, error: "Default lifetime must be between 0 and 3650 days" };
  }
  if (
    !Number.isInteger(input.defaultRateLimit) ||
    input.defaultRateLimit < 1 ||
    input.defaultRateLimit > 10000
  ) {
    return { ok: false, error: "Default rate limit must be between 1 and 10000" };
  }

  const { userId } = guard;
  const opts = { updatedBy: userId };

  try {
    await setSetting(db(), "api.token_default_ttl_days", input.defaultTtlDays, opts);
    await setSetting(db(), "api.rate_limit_per_minute", input.defaultRateLimit, opts);
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

  revalidatePath("/admin/api-tokens");
  return { ok: true };
}
