"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { timeAgo } from "@core/datetime";
import { banCountryByCode } from "../security/actions";
import { getFailedLogins, type FailedLoginsPage } from "./actions";

// Country code → flag emoji
function flagEmoji(code: string): string {
  const chars = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...chars);
}

// Minimal country name lookup for the most common codes
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CN: "China", RU: "Russia",
  DE: "Germany", FR: "France", JP: "Japan", IN: "India", BR: "Brazil",
  CA: "Canada", AU: "Australia", KR: "South Korea", IT: "Italy", ES: "Spain",
  NL: "Netherlands", PL: "Poland", TR: "Turkey", UA: "Ukraine", SE: "Sweden",
  MX: "Mexico", ID: "Indonesia", TH: "Thailand", VN: "Vietnam", PH: "Philippines",
  NG: "Nigeria", ZA: "South Africa", EG: "Egypt", AR: "Argentina", SA: "Saudi Arabia",
  PK: "Pakistan", BD: "Bangladesh", IR: "Iran", IQ: "Iraq", KP: "North Korea",
};

function countryLabel(code: string | null): string {
  if (!code) return "Unknown";
  return `${flagEmoji(code)} ${COUNTRY_NAMES[code] ?? code}`;
}

const btnCls =
  "h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed";

function sincePreset(preset: string): string | undefined {
  if (!preset) return undefined;
  const now = new Date();
  switch (preset) {
    case "24h": return new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
    default: return undefined;
  }
}

interface Props {
  initial: FailedLoginsPage;
}

export function FailedLoginsTab({ initial }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [dateRange, setDateRange] = useState("24h");
  const [page, setPage] = useState(1);

  useEffect(() => {
    startTransition(async () => {
      const next = await getFailedLogins(sincePreset(dateRange), page);
      setData(next);
    });
  }, [dateRange, page]);

  function handleBanCountry(code: string) {
    startTransition(async () => {
      const result = await banCountryByCode(code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${COUNTRY_NAMES[code] ?? code} added to deny list`);
      router.refresh();
    });
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="w-full space-y-5">
      {/* Filter */}
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">When</label>
          <Select value={dateRange} onValueChange={(v) => { setDateRange(v ?? "24h"); setPage(1); }}>
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
          {data.total.toLocaleString()} {data.total === 1 ? "attempt" : "attempts"}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left">
              <th className="font-medium text-slate-500 px-4 py-3 whitespace-nowrap">When</th>
              <th className="font-medium text-slate-500 px-4 py-3">Email tried</th>
              <th className="font-medium text-slate-500 px-4 py-3">Country</th>
              <th className="w-24 px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-500 italic">
                  No failed login attempts to show.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500" title={new Date(row.createdAt).toLocaleString()} suppressHydrationWarning>
                    {timeAgo(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.email ?? <span className="text-slate-300 italic">unknown</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {countryLabel(row.country)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.country ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => handleBanCountry(row.country!)}
                              disabled={pending}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Globe className="size-3.5" />
                              Ban {flagEmoji(row.country!)}
                            </button>
                          }
                        />
                        <TooltipContent>
                          Add {COUNTRY_NAMES[row.country!] ?? row.country} to country deny list
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
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
