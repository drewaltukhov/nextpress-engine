import type { PluginAPI } from "@core/plugins/api";

/**
 * Security core-plugin — Wordfence-style anti-brute-force.
 *
 * Phase 4 surfaces:
 *  - Account lockout (per-email): evaluateLockout() / applyFailedAttempt()
 *  - IP allow/block lists: checkIpAccess() / blockIp() / unblockIp() / autoBlockIfThresholdBreached()
 *  - IP guard (route handler wrapper): withIpGuard() / extractIp()
 *  - Step-up auth ("sudo" mode): requiresStepUp() / validateStepUp() / isStepUpFresh()
 *
 * Pending follow-ups:
 *  - Admin /admin/security screen (deferred to UI track)
 *  - site_settings.security.* once Phase 6 (settings) ships
 */
export default function register(_api: PluginAPI): void {
  // Service-layer helpers are imported directly by the auth path (see
  // @core/auth/services). Hook registrations land here as more surfaces ship.
}

// Account lockout
export {
  evaluateLockout,
  applyFailedAttempt,
  clearLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MINUTES,
  LOCKOUT_DURATION_MINUTES,
  type LockoutState
} from "./lockout";

// IP allow/block lists
export {
  checkIpAccess,
  blockIp,
  unblockIp,
  addAllowedIp,
  removeAllowedIp,
  autoBlockIfThresholdBreached,
  ipMatchesCidr,
  IP_FAILURE_THRESHOLD,
  IP_FAILURE_WINDOW_MINUTES,
  IP_LOCKOUT_MINUTES,
  type IpAccessResult
} from "./ip-access";

// IP guard (route handler wrapper)
export { withIpGuard, extractIp } from "./ip-guard";

// Step-up auth ("sudo" mode)
export {
  requiresStepUp,
  loadRoleStepUpConfig,
  isStepUpFresh,
  validateStepUp,
  STEP_UP_TTL_MINUTES
} from "./step-up";
