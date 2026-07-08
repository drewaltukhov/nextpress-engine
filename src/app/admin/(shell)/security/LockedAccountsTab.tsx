"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LockOpen, User } from "lucide-react";
import Link from "next/link";
import { unlockAccount, type LockedAccount } from "./actions";
import { parseSqliteUtc } from "@core/datetime";
import { useConfirm } from "@core/components/ConfirmDialog";

interface Props {
  rows: LockedAccount[];
}

function timeAgo(isoDate: string): string {
  const diff = parseSqliteUtc(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const min = Math.ceil(diff / 60_000);
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

export function LockedAccountsTab({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function handleUnlock(userId: string) {
    const ok = await confirm({
      title: "Unlock this account?",
      description: "The user will be able to sign in immediately.",
      confirmLabel: "Unlock",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await unlockAccount(userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Account unlocked");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <LockOpen className="size-5 text-green-600" />
          </div>
          <p className="text-sm font-medium text-slate-900">No accounts are currently locked</p>
          <p className="mt-1 text-sm text-slate-500">
            Accounts get temporarily locked after too many failed login attempts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Unlocks in</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.userId} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/users/${row.userId}/edit`}
                    className="flex items-center gap-2 hover:text-brand-green transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="size-4 text-slate-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{row.displayName}</div>
                      <div className="text-slate-500 text-xs">{row.email}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600" suppressHydrationWarning>
                  {timeAgo(row.lockoutUntil)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleUnlock(row.userId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-green hover:bg-brand-light-green/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <LockOpen className="size-3.5" />
                    Unlock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
