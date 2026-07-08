"use client";

import { useState, useTransition } from "react";
import { Lock, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { setRolePermission, type RoleRow } from "./actions";
import { ROLE_ENTITIES, hasGrade, type PermissionGrade } from "./entities";
import { DeleteRoleDialog } from "./DeleteRoleDialog";

interface PermCellProps {
  role: RoleRow;
  entityId: string;
  grade: PermissionGrade;
}

function PermCell({ role, entityId, grade }: PermCellProps) {
  const [checked, setChecked] = useState(hasGrade(role.permissions, entityId, grade.id));
  const [pending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await setRolePermission(role.slug, entityId, grade.id, next);
      if (!result.ok) {
        setChecked(!next);
        toast.error(result.error);
      } else {
        toast.success(`${role.label}: ${entityId}.${grade.id} ${next ? "granted" : "revoked"}`);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Switch
            checked={checked}
            onCheckedChange={handleToggle}
            disabled={pending}
          />
        </TooltipTrigger>
        <TooltipContent>{grade.description}</TooltipContent>
      </Tooltip>
      <span className="text-sm text-slate-600">{grade.label}</span>
    </span>
  );
}

export function RoleTable({ roles }: { roles: RoleRow[] }) {
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  if (roles.length === 0) {
    return <div className="text-center py-12 text-slate-500">No roles defined.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="text-left font-medium text-slate-500 px-4 py-3">Name</th>
              {ROLE_ENTITIES.map((e) => (
                <th
                  key={e.id}
                  className="text-left font-medium text-slate-500 px-4 py-3"
                >
                  {e.label}
                </th>
              ))}
              <th className="text-right font-medium text-slate-500 px-4 py-3">Users</th>
              <th className="w-12 px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const blockedReason = role.system
                ? "System roles can't be deleted"
                : role.userCount > 0
                  ? `Reassign the ${role.userCount} user${role.userCount === 1 ? "" : "s"} on this role first`
                  : null;
              return (
                <tr
                  key={role.slug}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{role.label}</span>
                      {role.system && (
                        <Tooltip>
                          <TooltipTrigger render={<span className="inline-flex" />}>
                            <Lock className="size-3.5 text-slate-400" />
                          </TooltipTrigger>
                          <TooltipContent>System role — name is fixed</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-400">{role.slug}</div>
                  </td>
                  {role.slug === "admin" ? (
                    <td
                      colSpan={ROLE_ENTITIES.length}
                      className="px-4 py-3 text-center align-top"
                    >
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-light-green text-brand-navy text-sm font-medium">
                        Full access
                      </span>
                    </td>
                  ) : (
                    ROLE_ENTITIES.map((entity) => (
                      <td key={entity.id} className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2">
                          {entity.grades.map((grade) => (
                            <PermCell
                              key={grade.id}
                              role={role}
                              entityId={entity.id}
                              grade={grade}
                            />
                          ))}
                        </div>
                      </td>
                    ))
                  )}
                  <td className="px-4 py-3 text-right text-slate-500 align-top">
                    {role.userCount}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={blockedReason ? undefined : () => setDeleting(role)}
                            disabled={blockedReason !== null}
                            aria-label={`Delete role ${role.label}`}
                            className={
                              blockedReason
                                ? "inline-flex items-center justify-center size-8 rounded-md text-slate-300 cursor-not-allowed"
                                : "inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                            }
                          />
                        }
                      >
                        <Trash2 className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>{blockedReason ?? "Delete role"}</TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DeleteRoleDialog
        role={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </>
  );
}
