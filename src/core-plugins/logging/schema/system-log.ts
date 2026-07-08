import { sqliteTable, integer, text, index, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const systemLog = sqliteTable(
  "system_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    level: text("level").notNull(),
    source: text("source").notNull(),
    event: text("event").notNull(),
    message: text("message").notNull(),
    context: text("context", { mode: "json" }).notNull().default(sql`('{}')`),
    traceId: text("trace_id"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
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
