"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, User, KeyRound } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getActivity,
  type ActivityFilters,
  type ActivityPage,
  type UserOption,
} from "./actions";
import { ACTION_LABELS } from "./action-labels";
import { timeAgo, parseSqliteUtc } from "@core/datetime";

const btnCls =
  "h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed";

// Date preset helpers
function sincePreset(preset: string): string | undefined {
  if (!preset) return undefined;
  const now = new Date();
  switch (preset) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
    default:
      return undefined;
  }
}

interface Props {
  initial: ActivityPage;
  users: UserOption[];
}

export function ActivityTab({ initial, users }: Props) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();

  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [dateRange, setDateRange] = useState("7d");
  const [appliedFilters, setAppliedFilters] = useState<ActivityFilters>({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (page === 1 && Object.keys(appliedFilters).length === 0) return;
    startTransition(async () => {
      const next = await getActivity(appliedFilters, page);
      setData(next);
    });
  }, [appliedFilters, page]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({
      actorId: actorId || undefined,
      action: action || undefined,
      since: sincePreset(dateRange),
    });
  }

  // Apply filters on any change. setState-in-effect is intentional here:
  // we want the data-fetch effect (keyed off appliedFilters + page) to fire
  // exactly once per filter edit, not on every keystroke against the input.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, action, dateRange]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  // Build unique action list from ACTION_LABELS
  const actionOptions = Object.entries(ACTION_LABELS).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  return (
    <div className="w-full space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Who</label>
          <Select value={actorId} onValueChange={(v) => setActorId(v ?? "")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="">Everyone</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">What</label>
          <Select value={action} onValueChange={(v) => setAction(v ?? "")}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="">All actions</SelectItem>
              {actionOptions.map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">When</label>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v ?? "7d")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto text-sm text-slate-500 pb-2">
          {data.total.toLocaleString()} {data.total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left">
              <th className="font-medium text-slate-500 px-4 py-3 whitespace-nowrap">When</th>
              <th className="font-medium text-slate-500 px-4 py-3">Who</th>
              <th className="font-medium text-slate-500 px-4 py-3">What</th>
              <th className="font-medium text-slate-500 px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-500 italic">
                  No activity to show.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500" title={parseSqliteUtc(row.createdAt).toLocaleString()} suppressHydrationWarning>
                    {timeAgo(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {row.actorName ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User className="size-3.5 text-slate-400" />
                        </div>
                        <span className="text-slate-700 font-medium">{row.actorName}</span>
                      </div>
                    ) : row.action.startsWith("auth.api.") ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                          <KeyRound className="size-3.5 text-amber-500" />
                        </div>
                        <span className="text-slate-600">API token</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.friendlyAction}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={row.details}>
                    {row.details || <span className="text-slate-300">-</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div>
            Page {data.page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className={btnCls}
            >
              <ChevronLeft className="size-4 inline -mt-0.5" /> Prev
            </button>
            <button
              type="button"
              disabled={pending || data.page >= totalPages}
              onClick={() => setPage(data.page + 1)}
              className={btnCls}
            >
              Next <ChevronRight className="size-4 inline -mt-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
