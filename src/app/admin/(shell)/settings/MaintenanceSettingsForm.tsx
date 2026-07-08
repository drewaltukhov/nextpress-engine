"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { saveMaintenanceSettings, type MaintenanceSettings } from "./maintenance-actions";

interface Props {
  initial: MaintenanceSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function MaintenanceSettingsForm({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [message, setMessage] = useState(initial.message);
  const [allowAdminAccess, setAllowAdminAccess] = useState(initial.allowAdminAccess);
  const [readOnly, setReadOnly] = useState(initial.readOnly);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveMaintenanceSettings({ enabled, message, allowAdminAccess, readOnly });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Maintenance settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {(enabled || readOnly) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            {enabled && readOnly
              ? "Both maintenance and read-only modes are active. Visitors see a \"down for maintenance\" page, and all changes are blocked."
              : enabled
                ? "Maintenance mode is on. Visitors see a \"down for maintenance\" page instead of your site."
                : "Read-only mode is on. Nobody can make changes until you turn it off."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Mode toggles ────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Mode</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Maintenance mode</div>
                <div className="text-xs text-slate-500">
                  Show a &quot;down for maintenance&quot; page to all visitors.
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Read-only mode</div>
                <div className="text-xs text-slate-500">
                  Prevent all changes. Useful before a major update.
                </div>
              </div>
              <Switch checked={readOnly} onCheckedChange={setReadOnly} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Allow admin access</div>
                <div className="text-xs text-slate-500">
                  Let admins through based on recent login locations.
                </div>
              </div>
              <Switch checked={allowAdminAccess} onCheckedChange={setAllowAdminAccess} />
            </div>
          </div>
        </div>

        {/* ── Message ─────────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Visitor Message</h3>
          <div>
            <label htmlFor="mt-message" className={labelCls}>
              Message to show visitors
            </label>
            <textarea
              id="mt-message"
              rows={6}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Shown on the maintenance page while your site is down.
            </p>
          </div>
        </div>

      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
