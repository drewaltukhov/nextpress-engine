import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { MaintenanceState } from "@core/maintenance";

interface Props {
  state: MaintenanceState;
}

/**
 * Sticky amber banner shown across the admin shell whenever
 * maintenance.enabled or maintenance.read_only is on. Renders nothing
 * when both are off.
 */
export function MaintenanceBanner({ state }: Props) {
  if (!state.enabled && !state.readOnly) return null;

  const message =
    state.enabled && state.readOnly
      ? "Maintenance + read-only modes are on — public visitors see the maintenance page and writes are blocked except from bypass IPs."
      : state.enabled
        ? "Maintenance mode is on. Public visitors see a 503 with the configured message."
        : "Read-only mode is on. Mutating actions are blocked except from bypass IPs.";

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-3">
      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
      <span className="text-sm text-amber-900 font-medium">{message}</span>
      <Link
        href="/admin/settings?tab=maintenance"
        className="ml-auto text-sm text-amber-900 underline underline-offset-2 hover:text-amber-700"
      >
        Manage
      </Link>
    </div>
  );
}
