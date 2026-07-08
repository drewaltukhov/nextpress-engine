import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const failedJobs = pgTable(
  "failed_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    jobType: text("job_type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    errorMessage: text("error_message").notNull(),
    errorStack: text("error_stack"),
    attemptCount: integer("attempt_count").notNull().default(1),
    nextRetryAt: text("next_retry_at"),
    resolvedAt: text("resolved_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pendingIdx: index("failed_jobs_pending_idx").on(t.nextRetryAt).where(sql`${t.resolvedAt} IS NULL`)
  })
);

export type FailedJobRow = typeof failedJobs.$inferSelect;
