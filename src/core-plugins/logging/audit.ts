/**
 * auditLog() — single entry point for writing to audit_log. Plugins MUST go
 * through this helper (per Plugin Etiquette in the foundation spec) so
 * redaction + actor capture + diff truncation happen consistently.
 */
import type { DbClient } from "@core/db/client";
import { ensureRedactionPatternsLoaded, redact } from "./redactor";

const DIFF_MAX_BYTES = 100 * 1024;     // 100 KB

export interface AuditInput {
  tenantId?: number;
  actorUserId?: string | null;
  actorTokenId?: number | null;
  sessionId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  diff?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
}

export async function auditLog(db: DbClient, input: AuditInput): Promise<void> {
  let diffJson: string | null = null;
  let diffSize: number | null = null;
  let truncated = false;

  if (input.diff !== undefined) {
    await ensureRedactionPatternsLoaded(db);
    const redacted = redact(input.diff);
    const serialized = JSON.stringify(redacted);
    diffSize = Buffer.byteLength(serialized, "utf8");
    if (diffSize > DIFF_MAX_BYTES) {
      diffJson = JSON.stringify({ truncated: true, originalBytes: diffSize, head: serialized.slice(0, DIFF_MAX_BYTES) });
      truncated = true;
    } else {
      diffJson = serialized;
    }
  }

  const baseArgs = [
    input.tenantId ?? 1,
    input.actorUserId ?? null,
    input.actorTokenId ?? null,
    input.sessionId ?? null,
    input.action,
    input.targetType ?? null,
    input.targetId ?? null,
    diffJson,
    diffSize,
    truncated ? 1 : 0,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.traceId ?? null
  ];

  const sql = `INSERT INTO audit_log
          (tenant_id, actor_user_id, actor_token_id, session_id, action,
           target_type, target_id, diff, diff_size_bytes, diff_truncated,
           ip_address, user_agent, trace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    await db.execute({ sql, args: baseArgs });
  } catch (err) {
    // FK constraint failure (stale JWT user ID after restore) — retry without actor
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("FOREIGN KEY") && input.actorUserId) {
      const retryArgs = [...baseArgs];
      retryArgs[1] = null; // actor_user_id
      await db.execute({ sql, args: retryArgs });
    } else {
      throw err;
    }
  }
}
