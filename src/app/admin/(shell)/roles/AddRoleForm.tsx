"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createRole } from "./actions";
import { ROLE_ENTITIES, permissionFor, slugifyRoleLabel } from "./entities";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

type EnabledMap = Record<string, boolean>;

function buildInitialEnabled(): EnabledMap {
  const map: EnabledMap = {};
  for (const entity of ROLE_ENTITIES) {
    for (const grade of entity.grades) {
      map[permissionFor(entity.id, grade.id)] = false;
    }
  }
  return map;
}

export function AddRoleForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState<EnabledMap>(() => buildInitialEnabled());

  function toggle(perm: string, next: boolean) {
    setEnabled((prev) => ({ ...prev, [perm]: next }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const enabledPermissions = Object.entries(enabled)
        .filter(([, on]) => on)
        .map(([perm]) => perm);
      const result = await createRole({ label, enabledPermissions });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Role "${label}" created`);
      setLabel("");
      setEnabled(buildInitialEnabled());
      router.refresh();
    });
  }

  const previewSlug = slugifyRoleLabel(label);

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div>
        <label htmlFor="add-role-name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Role name
        </label>
        <input
          id="add-role-name"
          type="text"
          required
          placeholder="Marketing"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputCls}
        />
        {previewSlug && (
          <p className="mt-2 text-sm text-slate-400">
            Slug: <code className="font-mono">{previewSlug}</code>
          </p>
        )}
      </div>

      <div>
        <div className="block text-sm font-medium text-slate-700 mb-2">Permissions</div>
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {ROLE_ENTITIES.map((entity) => (
            <div key={entity.id} className="px-4 py-3">
              <div className="text-sm font-medium text-slate-700 mb-2">{entity.label}</div>
              <div className="space-y-2.5">
                {entity.grades.map((grade) => {
                  const perm = permissionFor(entity.id, grade.id);
                  return (
                    <div
                      key={grade.id}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-slate-700">{grade.label}</div>
                        <div className="text-sm text-slate-400">{grade.description}</div>
                      </div>
                      <Switch
                        checked={enabled[perm] ?? false}
                        onCheckedChange={(next) => toggle(perm, next)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-8 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Creating…" : "Create role"}
        </button>
      </div>
    </form>
  );
}
