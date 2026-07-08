import type { PluginAPI } from "@core/plugins/api";

/**
 * Users core-plugin — owns the user data model + auth backend.
 *
 * Phase 2 surfaces:
 *   - 7 tables (users, user_credentials, user_oauth_accounts, user_email_tokens,
 *     session_revocations, roles, user_roles) via migrations/001_init.sql
 *   - Service layer for credentials auth, email verification, password reset
 *   - Default roles seed (admin, editor, author, contributor)
 *
 * Admin UI for users lives in a later phase (post-core).
 * NextAuth wiring + credentials provider lives in @core/auth/ (kernel),
 * not here — this plugin only owns data + service-layer logic.
 */
export default function register(_api: PluginAPI): void {
  // Hook registrations land here as the service layer comes online.
  // For now: just claim the plugin slot so the loader records us.
}

export {
  getAuthorByUsername,
  getAuthorById,
  authorProfileSameAs,
  type AuthorProfile,
} from "./profile";
