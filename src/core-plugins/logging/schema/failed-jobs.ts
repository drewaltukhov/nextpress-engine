import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const failedJobs = sqliteTable(
  "failed_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    jobType: text("job_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull().default(sql`('{}')`),
    errorMessage: text("error_message").notNull(),
    errorStack: text("error_stack"),
    attemptCount: integer("attempt_count").notNull().default(1),
    nextRetryAt: text("next_retry_at"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pendingIdx: index("failed_jobs_pending_idx").on(t.nextRetryAt).where(sql`${t.resolvedAt} IS NULL`)
  })
);

export type FailedJobRow = typeof failedJobs.$inferSelect;
