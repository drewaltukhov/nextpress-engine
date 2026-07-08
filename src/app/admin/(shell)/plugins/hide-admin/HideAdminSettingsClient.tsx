"use client";

import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Lock, ShieldCheck, AlertTriangle } from "lucide-react";
import { validateAdminPath } from "@core/auth/admin-path-validator";
import { useConfirm } from "@core/components/ConfirmDialog";
import { saveAdminPath, clearAdminPath, type HideAdminSettings } from "./actions";

interface Props {
  initial: HideAdminSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function HideAdminSettingsClient({ initial }: Props) {
  const [path, setPath] = useState(initial.path);
  const [savePending, startSave] = useTransition();
  const [clearPending, startClear] = useTransition();
  const confirm = useConfirm();

  const validation = useMemo(() => {
    if (path.length === 0) return { ok: true as const };
    return validateAdminPath(path);
  }, [path]);

  const isOn = initial.path.length > 0;
  const envLocked = initial.envOverrideActive;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (path.length === 0) {
      toast.error("Use Clear to disable hiding");
      return;
    }
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }
    startSave(async () => {
      const r = await saveAdminPath(path);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Admin is now hidden at ${r.path}`);
    });
  }

  async function handleClear() {
    const ok = await confirm({
      title: "Disable hiding?",
      description: "/admin will be reachable directly again.",
      confirmLabel: "Disable",
      danger: true,
    });
    if (!ok) return;
    startClear(async () => {
      const r = await clearAdminPath();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPath("");
      toast.success("Hiding disabled");
    });
  }

  return (
    <div className="space-y-5">
      {envLocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
          <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-medium mb-0.5">Env override is active</p>
            <p className="text-amber-800">
              <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[12px]">NEXTPRESS_ADMIN_PATH</code> is set to{" "}
              <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[12px]">{initial.envOverrideValue}</code>.
              The DB value below is shown for reference but ignored while the env var is set.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className={cardCls}>
        <div className="flex items-center gap-2 mb-1">
          {isOn ? <Lock className="size-4 text-brand-green" /> : <ShieldCheck className="size-4 text-slate-400" />}
          <h3 className="text-sm font-semibold text-slate-900">Admin path</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          The URL the admin login lives at. Leave empty to disable hiding. Anyone hitting{" "}
          <code className="text-[11px]">/admin</code> while hiding is on will get a flat 404.
        </p>

        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/control-panel-xyz"
          className={inputCls}
          disabled={envLocked || savePending || clearPending}
          autoComplete="off"
          spellCheck={false}
        />

        {path.length > 0 && !validation.ok && (
          <p className="mt-1.5 text-xs text-red-600">{validation.reason}</p>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="submit"
            disabled={envLocked || savePending || (path.length > 0 && !validation.ok)}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savePending ? "Saving..." : isOn ? "Update path" : "Enable hiding"}
          </button>
          {isOn && !envLocked && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearPending}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {clearPending ? "Clearing..." : "Clear / disable"}
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
        <p className="font-medium text-slate-800">Recovery</p>
        <p>
          If you forget the path, set <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">NEXTPRESS_ADMIN_PATH=/admin</code>{" "}
          in your environment (Vercel, .env.local, etc.) and restart. Canonical{" "}
          <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">/admin</code> will be reachable again.
        </p>
      </div>
    </div>
  );
}
