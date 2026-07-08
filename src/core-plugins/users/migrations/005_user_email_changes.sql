-- Self-service email-change flow.
--
-- Pending changes live here so the verification link can update the
-- canonical `users.email` only after the user proves they own the new
-- mailbox. Admins use a separate direct-change action that updates
-- `users.email` immediately and (defensively) marks every open row here
-- as consumed.

CREATE TABLE IF NOT EXISTS user_email_changes (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS user_email_changes_user_idx ON user_email_changes (user_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS user_email_changes_expires_idx ON user_email_changes (expires_at);
--> statement-breakpoint

-- Only one open (un-consumed, un-expired) request per user. Saves us from
-- racing requestEmailChange calls and prevents an attacker from spamming
-- new-email confirmation links.
CREATE UNIQUE INDEX IF NOT EXISTS user_email_changes_pending_unique
  ON user_email_changes (user_id)
  WHERE consumed_at IS NULL;
