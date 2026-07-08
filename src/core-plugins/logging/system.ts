/**
 * systemLog() — single entry for writing to system_log. Goes through the
 * redactor so secret-shaped values in `context` are masked before they hit
 * the DB.
 */
import type { DbClient } from "@core/db/client";
import { ensureRedactionPatternsLoaded, redact } from "./redactor";
import type { LogLevel } from "./schema/system-log";

export interface SystemLogInput {
  tenantId?: number;
  level: LogLevel;
  source: string;          // 'core' or plugin slug
  event: string;           // e.g. 'auth.login', 'sitemap.render'
  message: string;
  context?: unknown;
  traceId?: string | null;
}

export async function systemLog(db: DbClient, input: SystemLogInput): Promise<void> {
  await ensureRedactionPatternsLoaded(db);
  const ctx = input.context !== undefined ? JSON.stringify(redact(input.context)) : "{}";
  await db.execute({
    sql: `INSERT INTO system_log (tenant_id, level, source, event, message, context, trace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.tenantId ?? 1,
      input.level,
      input.source,
      input.event,
      input.message,
      ctx,
      input.traceId ?? null
    ]
  });
}

/**
 * recordFailedLogin() — append-only insert into failed_logins for forensics
 * and the security plugin's lockout / IP-block thresholds (phase 4).
 */
export interface FailedLoginInput {
  tenantId?: number;
  email: string | null;
  ipAddress: string;
  reason: "bad_password" | "unknown_email" | "rate_limited" | "mfa_failed" | "account_disabled";
  userAgent?: string | null;
  geo?: Record<string, unknown>;
}

export async function recordFailedLogin(db: DbClient, input: FailedLoginInput): Promise<void> {
  await db.execute({
    sql: `INSERT INTO failed_logins (tenant_id, email, ip_address, reason, geo, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      input.tenantId ?? 1,
      input.email,
      input.ipAddress,
      input.reason,
      JSON.stringify(input.geo ?? {}),
      input.userAgent ?? null
    ]
  });
}

/**
 * recordPluginFailure() — append-only insert into plugin_failures. Persists
 * what the in-memory PluginFailureRing captures so admin UIs + alerting can
 * read failure history across restarts.
 *
 * `phase` matches the CHECK on plugin_failures: boot|migrate|register|hook|route.
 */
export interface PluginFailureInput {
  pluginSlug: string;
  phase: "boot" | "migrate" | "register" | "hook" | "route";
  hookName?: string | null;
  errorMessage: string;
  errorClass?: string | null;
  errorStack?: string | null;
  context?: unknown;
}

export async function recordPluginFailure(db: DbClient, input: PluginFailureInput): Promise<void> {
  await ensureRedactionPatternsLoaded(db);
  const ctx = input.context !== undefined ? JSON.stringify(redact(input.context)) : "{}";
  await db.execute({
    sql: `INSERT INTO plugin_failures
            (plugin_slug, phase, hook_name, error_message, error_class, error_stack, context)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.pluginSlug,
      input.phase,
      input.hookName ?? null,
      input.errorMessage,
      input.errorClass ?? null,
      input.errorStack ?? null,
      ctx
    ]
  });
}
