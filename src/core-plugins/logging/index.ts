import type { PluginAPI } from "@core/plugins/api";

/**
 * Logging core-plugin — owns the 5 log tables + redactor + retention job.
 * Tables: system_log, failed_jobs, failed_logins, audit_log, plugin_failures.
 *
 * Helpers exposed to other plugins (import from "@core-plugins/logging"):
 *  - auditLog()          — writes to audit_log (redactor + 100KB truncation)
 *  - systemLog()         — writes to system_log
 *  - recordFailedLogin() — writes to failed_logins (security plugin reads this)
 *  - redact()            — deep-walk secret redactor
 */
export default function register(_api: PluginAPI): void {
  // No hooks registered yet. Service-layer helpers are imported directly.
}

export { auditLog, type AuditInput } from "./audit";
export {
  systemLog,
  recordFailedLogin,
  recordPluginFailure,
  type SystemLogInput,
  type FailedLoginInput,
  type PluginFailureInput
} from "./system";
export {
  redact,
  ensureRedactionPatternsLoaded,
  resetRedactionPatterns
} from "./redactor";
export {
  runRetentionCleanup,
  DEFAULT_RETENTION,
  type RetentionPolicy,
  type RetentionResult,
  type RetentionOptions
} from "./retention";
