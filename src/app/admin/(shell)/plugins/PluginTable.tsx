"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, ExternalLink, Puzzle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { togglePlugin, deletePlugin, type PluginListItem } from "./actions";
import { parseSqliteUtc } from "@core/datetime";
import { useConfirm } from "@core/components/ConfirmDialog";

function formatDate(iso: string): string {
  try {
    return parseSqliteUtc(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function EnableToggle({ plugin }: { plugin: PluginListItem }) {
  const [checked, setChecked] = useState(plugin.enabled);
  const [pending, startTransition] = useTransition();

  const isLocked = plugin.tier === "essential";

  function handleToggle(newChecked: boolean) {
    setChecked(newChecked);
    startTransition(async () => {
      const result = await togglePlugin(plugin.slug, newChecked);
      if (!result.ok) {
        setChecked(!newChecked);
        toast.error(result.error);
      } else {
        toast.success(`${plugin.name} ${newChecked ? "enabled" : "disabled"}`);
      }
    });
  }

  if (isLocked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-block">
              <Switch checked={true} disabled onCheckedChange={() => {}} />
            </span>
          }
        />
        <TooltipContent>Essential — always enabled</TooltipContent>
      </Tooltip>
    );
  }

  return <Switch checked={checked} onCheckedChange={handleToggle} disabled={pending} />;
}

function DeleteButton({ plugin }: { plugin: PluginListItem }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  if (plugin.type === "system") {
    return null;
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${plugin.name}"?`,
      description: "This removes the plugin row from the database. The plugin files on disk are not affected.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePlugin(plugin.slug);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(`${plugin.name} deleted`);
      }
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        }
      />
      <TooltipContent>Delete plugin</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  plugins: PluginListItem[];
  showType?: boolean;
}

export function PluginTable({ plugins }: Props) {
  if (plugins.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
            <Puzzle className="size-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-900">No plugins here yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Custom plugins will appear here once installed.
          </p>
        </div>
      </div>
    );
  }

  const isSystem = plugins[0]?.type === "system";

  return (
    <div className="w-full">
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Plugin</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Version</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Installed</th>
              <th className="text-center px-4 py-3 font-medium text-slate-500">Enabled</th>
              {!isSystem && (
                <th className="text-right px-4 py-3 font-medium text-slate-500">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plugins.map((p) => (
              <tr key={p.slug} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      {p.name}
                      {p.failureCount > 0 && (
                        <span className="ml-2 text-xs text-red-500 font-normal">
                          {p.failureCount} failure{p.failureCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{p.slug}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {p.version}
                </td>
                <td className="px-4 py-3 text-slate-500" suppressHydrationWarning>
                  {formatDate(p.installedAt)}
                </td>
                <td className="px-4 py-3 text-center">
                  <EnableToggle plugin={p} />
                </td>
                {!isSystem && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {p.adminHref && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                href={p.adminHref}
                                className="p-1.5 text-slate-400 hover:text-brand-green transition-colors"
                              >
                                <ExternalLink className="size-4" />
                              </Link>
                            }
                          />
                          <TooltipContent>Settings</TooltipContent>
                        </Tooltip>
                      )}
                      <DeleteButton plugin={p} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
