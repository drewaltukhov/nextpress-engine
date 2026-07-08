import { pgTable, serial, integer, text, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const systemLog = pgTable(
  "system_log",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    level: text("level").notNull(),
    source: text("source").notNull(),
    event: text("event").notNull(),
    message: text("message").notNull(),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    levelCheck: check("system_log_level_check", sql`${t.level} IN ('debug','info','warn','error')`),
    recentIdx: index("system_log_recent_idx").on(t.tenantId, t.level, t.createdAt),
    sourceIdx: index("system_log_source_idx").on(t.source, t.createdAt),
    traceIdx: index("system_log_trace_idx").on(t.traceId).where(sql`${t.traceId} IS NOT NULL`)
  })
);

export type SystemLogRow = typeof systemLog.$inferSelect;
export type LogLevel = "debug" | "info" | "warn" | "error";
