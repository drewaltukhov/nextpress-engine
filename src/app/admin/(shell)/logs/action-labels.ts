/**
 * Action name mapping — dot-notation audit_log.action → human-readable labels.
 * Shared between server actions and client components.
 */

export const ACTION_LABELS: Record<string, string> = {
  // Auth
  "auth.login.success": "Signed in",
  "auth.logout": "Signed out",
  "auth.session.revoked": "Revoked session",
  "auth.step_up.success": "Step-up verified",
  "auth.step_up.failed": "Step-up failed",
  "auth.api.introspect": "API token introspection",

  // Users
  "users.create": "Created user",
  "users.update": "Updated user",
  "users.delete": "Deleted user",
  "users.enable": "Enabled user",
  "users.disable": "Disabled user",
  "users.invite_sent": "Invite sent",
  "users.invite_accepted": "Invite accepted",
  "users.password_reset_requested": "Password reset requested",
  "users.password_reset_requested_self": "Password reset requested",
  "users.password_reset_completed": "Password reset completed",
  "users.email_change_bootstrap": "Email changed (bootstrap)",
  "users.email_change_direct": "Email changed (admin)",
  "users.email_change_requested": "Email change requested",
  "users.email_change_confirmed": "Email change confirmed",

  // Legacy user.* codes (older entries may use these)
  "user.created": "Created user",
  "user.deleted": "Deleted user",
  "user.updated": "Updated user",
  "user.role.changed": "Changed user role",
  "user.email.changed": "Changed email",
  "user.unlocked": "Unlocked account",
  "user.disabled": "Disabled user",

  // Settings
  "settings.changed": "Changed settings",
  "settings.encrypted.changed": "Changed sensitive setting",
  "settings.encrypted.revealed": "Viewed sensitive setting",
  "settings.security.country": "Changed country access",
  "settings.logging.update": "Changed log settings",
  "settings.maintenance.update": "Changed maintenance settings",
  "settings.api.update": "Changed API settings",

  // Content — current plural codes
  "pages.created": "Created page",
  "pages.updated": "Updated page",
  "pages.seoUpdated": "Updated page SEO",
  "pages.published": "Published page",
  "pages.unpublished": "Unpublished page",
  "pages.trashed": "Moved page to trash",
  "pages.restored": "Restored page",
  "pages.purged": "Permanently deleted page",
  "pages.duplicated": "Duplicated page",
  "posts.created": "Created post",
  "posts.updated": "Updated post",
  "posts.seoUpdated": "Updated post SEO",
  "posts.published": "Published post",
  "posts.unpublished": "Unpublished post",
  "posts.trashed": "Moved post to trash",
  "posts.restored": "Restored post",
  "posts.purged": "Permanently deleted post",
  "posts.duplicated": "Duplicated post",

  // Content — legacy singular codes (older entries may use these)
  "post.created": "Created post",
  "post.published": "Published post",
  "post.updated": "Updated post",
  "post.deleted": "Deleted post",
  "media.uploaded": "Uploaded file",
  "media.deleted": "Deleted file",
  "redirect.created": "Created redirect",

  // Themes
  "themes.activated": "Activated theme",
  "themes.deactivated": "Deactivated theme",
  "themes.builder.saved": "Saved theme layout",
  "themes.builder.defaults_restored": "Restored theme defaults",

  // Plugins & roles
  "plugin.enabled": "Enabled plugin",
  "plugin.disabled": "Disabled plugin",
  "token.created": "Created API token",
  "token.revoked": "Revoked API token",
  "roles.create": "Created role",
  "roles.delete": "Deleted role",
  "roles.permission_grant": "Granted permission",
  "roles.permission_revoke": "Revoked permission",
  "role.created": "Created role",
  "role.deleted": "Deleted role",

  // Security
  "security.ip_block": "Blocked IP address",
  "security.country_ban": "Banned country",

  // Backup
  "backup.created": "Created backup",
  "backup.restored": "Restored from backup",
  "logs.purged": "Purged all logs",
  "plugin.deleted": "Deleted plugin",
};

export function friendlyAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const parts = action.split(".");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/_/g, " ");
}
