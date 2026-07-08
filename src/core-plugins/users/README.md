# `users` core-plugin

Owns the user data model and the credentials auth service layer.

- **Tables:** `users`, `user_credentials`, `user_oauth_accounts`, `user_email_tokens`, `session_revocations`, `roles`, `user_roles`
- **Default roles** (seeded by `001_init.sql`): `admin`, `editor`, `author`, `contributor`
- **Hooks exposed:** `user.beforeSave`, `user.afterSave`, `user.afterCreate`, `user.beforeDelete`, `user.afterDelete`
- **Out of scope here:** NextAuth wiring + credentials provider (lives in `@core/auth/`), admin UI (lands in a later phase).
