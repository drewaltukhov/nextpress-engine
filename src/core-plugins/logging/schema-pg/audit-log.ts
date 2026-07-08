import { pgTable, serial, integer, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema-pg/users";

/**
 * Append-only audit trail for sensitive operations (principle #7).
 *
 * actor_token_id references api_tokens.id but the FK constraint cannot be
 * added to an existing SQLite table without a destructive rebuild. The
 * relationship is enforced at the application layer (auditLog helper) and
 * documented here for Drizzle's type system. An index on actor_token_id
 * was added in logging migration 002.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorTokenId: integer("actor_token_id"),     // logically FK → api_tokens.id; enforced at app layer
    sessionId: text("session_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    diff: jsonb("diff"),
    diffSizeBytes: integer("diff_size_bytes"),
    diffTruncated: boolean("diff_truncated").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    actorIdx: index("audit_log_actor_idx").on(t.tenantId, t.actorUserId, t.createdAt),
    actionIdx: index("audit_log_action_idx").on(t.tenantId, t.action, t.createdAt),
    targetIdx: index("audit_log_target_idx").on(t.targetType, t.targetId, t.createdAt),
    sessionIdx: index("audit_log_session_idx").on(t.sessionId, t.createdAt).where(sql`${t.sessionId} IS NOT NULL`),
    tokenIdx: index("audit_log_token_idx").on(t.actorTokenId, t.createdAt).where(sql`${t.actorTokenId} IS NOT NULL`)
  })
);

export type AuditLogRow = typeof auditLog.$inferSelect;
