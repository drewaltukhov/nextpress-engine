"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import { timeAgo } from "@core/datetime";
import type { TokenListItem } from "@core-plugins/api";
import { revokeTokenAction } from "./actions";
import { GenerateTokenDialog } from "./GenerateTokenDialog";

interface Props {
  initial: TokenListItem[];
  defaultTtlDays: number;
}

export function MyTokensTab({ initial, defaultTtlDays }: Props) {
  const [generateOpen, setGenerateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {initial.length === 0
            ? "You don't have any tokens yet."
            : `${initial.length} active token${initial.length === 1 ? "" : "s"}.`}
        </p>
        <button
          type="button"
          onClick={() => setGenerateOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Generate token
        </button>
      </div>

      {initial.length === 0 ? (
        <EmptyState onCreate={() => setGenerateOpen(true)} />
      ) : (
        <TokensTable rows={initial} />
      )}

      <GenerateTokenDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        defaultTtlDays={defaultTtlDays}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm text-slate-500">
        Generate a token to authenticate against the REST API.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Generate your first token
      </button>
    </div>
  );
}

function TokensTable({ rows }: { rows: TokenListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            <th className="text-left font-medium text-slate-500 px-4 py-3">Name</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Prefix</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Scopes</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Last used</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Expires</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TokenRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenRow({ row }: { row: TokenListItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function handleRevoke() {
    const ok = await confirm({
      title: "Revoke token?",
      description: `"${row.name}" will stop authenticating immediately and can't be restored.`,
      confirmLabel: "Revoke",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revokeTokenAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Token revoked");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.prefix}…</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {row.scopes.length === 0 ? (
            <span className="text-xs text-slate-400">none</span>
          ) : (
            row.scopes.map((s) => (
              <span
                key={s}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  s === "*" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-500">
        {row.lastUsedAt ? (
          <span title={row.lastUsedIp ?? undefined}>{timeAgo(row.lastUsedAt)}</span>
        ) : (
          "Never"
        )}
      </td>
      <td className="px-4 py-3 text-slate-500">{formatExpires(row.expiresAt)}</td>
      <td className="px-4 py-3 text-right">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={handleRevoke}
                disabled={pending}
                aria-label="Revoke token"
                className="inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            }
          />
          <TooltipContent>Revoke token</TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}

function formatExpires(iso: string | null): string {
  if (!iso) return "Never";
  try {
    const date = new Date(iso);
    if (date.getTime() < Date.now()) return "Expired";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
