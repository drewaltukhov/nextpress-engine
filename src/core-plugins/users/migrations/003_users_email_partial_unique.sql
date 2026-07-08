-- Convert the (tenant_id, email) unique index to a partial unique index
-- that only applies to live (non-soft-deleted) rows.
--
-- Before: an email can only ever appear once per tenant in the table —
-- soft-deleting a user permanently reserves their email.
-- After: an email can be re-used after the previous holder is soft-deleted,
-- which matches createUser's duplicate guard (`WHERE deleted_at IS NULL`).

DROP INDEX IF EXISTS users_tenant_email_unique;
--> statement-breakpoint

DROP INDEX IF EXISTS users_active_idx;
--> statement-breakpoint

CREATE UNIQUE INDEX users_active_email_unique
  ON users (tenant_id, email)
  WHERE deleted_at IS NULL;
