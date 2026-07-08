"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import { timeAgo } from "@core/datetime";
import type { RedirectListItem, RedirectSource } from "@core-plugins/redirects";
import {
  toggleRedirectActiveAction,
  deleteRedirectAction,
} from "./actions";
import { CreateRedirectDialog } from "./CreateRedirectDialog";

interface Props {
  initial: RedirectListItem[];
  defaultStatus: number;
}

const SOURCE_OPTIONS: { value: "all" | RedirectSource; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "manual", label: "Manual" },
  { value: "permalink_change", label: "Permalink change" },
  { value: "slug_change", label: "Slug change" },
  { value: "media_rename", label: "Media rename" },
];

const SOURCE_LABEL: Record<RedirectSource, string> = {
  manual: "Manual",
  permalink_change: "Permalink",
  slug_change: "Slug",
  media_rename: "Media",
};

const SOURCE_PILL_CLS: Record<RedirectSource, string> = {
  manual: "bg-slate-100 text-slate-600",
  permalink_change: "bg-blue-100 text-blue-700",
  slug_change: "bg-amber-100 text-amber-700",
  media_rename: "bg-violet-100 text-violet-700",
};

const STATUS_BADGE_CLS: Record<number, string> = {
  301: "bg-emerald-100 text-emerald-700",
  302: "bg-sky-100 text-sky-700",
  307: "bg-sky-100 text-sky-700",
  308: "bg-emerald-100 text-emerald-700",
  410: "bg-red-100 text-red-700",
};

export function ManageTab({ initial, defaultStatus }: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all" | RedirectSource>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      if (q && !r.fromPath.toLowerCase().includes(q) && !r.toPath.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [initial, search, source]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search from / to paths"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
            />
          </div>
          <Select
            value={source}
            onValueChange={(v) => {
              if (v) setSource(v as "all" | RedirectSource);
            }}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue>
                {SOURCE_OPTIONS.find((o) => o.value === source)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Create redirect
        </button>
      </div>

      {initial.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 rounded-lg border border-slate-200 bg-white">
          No redirects match those filters.
        </div>
      ) : (
        <RedirectsTable rows={filtered} />
      )}

      <CreateRedirectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStatus={defaultStatus}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm text-slate-500">No redirects yet.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Create your first redirect
      </button>
    </div>
  );
}

function RedirectsTable({ rows }: { rows: RedirectListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            <th className="text-left font-medium text-slate-500 px-4 py-3">From</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">To</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Status</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Source</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3">Hits</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Last hit</th>
            <th className="text-center font-medium text-slate-500 px-4 py-3">Active</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RedirectRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RedirectRow({ row }: { row: RedirectListItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [active, setActive] = useState(row.active);
  const [pending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await toggleRedirectActiveAction(row.id, next);
      if (!result.ok) {
        setActive(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Redirect activated" : "Redirect deactivated");
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete redirect?",
      description: `${row.fromPath} → ${row.toPath} will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteRedirectAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Redirect deleted");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
        {row.fromPath}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
        {row.toPath}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            STATUS_BADGE_CLS[row.status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_PILL_CLS[row.source]}`}
        >
          {SOURCE_LABEL[row.source]}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {row.hitCount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-slate-500">
        {row.lastHitAt ? timeAgo(row.lastHitAt) : "Never"}
      </td>
      <td className="px-4 py-3 text-center">
        <Switch checked={active} onCheckedChange={handleToggle} disabled={pending} />
      </td>
      <td className="px-4 py-3 text-right">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                aria-label="Delete redirect"
                className="inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            }
          />
          <TooltipContent>Delete redirect</TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}
