"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Monitor as MonitorIcon } from "lucide-react";
import { revokeSession, type ActiveSession } from "./actions";
import { useConfirm } from "@core/components/ConfirmDialog";
import { timeAgo, parseSqliteUtc } from "@core/datetime";

/** Parse a raw user-agent string into a friendly device label */
function parseDevice(ua: string | null): string {
  if (!ua) return "Unknown device";

  let browser = "Unknown browser";
  let os = "Unknown OS";

  // Browser detection
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

  // OS detection
  if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "Mac";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

interface Props {
  sessions: ActiveSession[];
}

export function SessionsTab({ sessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function handleRevoke(userId: string) {
    const ok = await confirm({
      title: "End this session?",
      description: "The user will need to sign in again on their next request.",
      confirmLabel: "End session",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revokeSession(userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Session revoked");
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-xl bg-white border border-slate-200 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
            <MonitorIcon className="size-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-900">No active sessions</p>
          <p className="mt-1 text-sm text-slate-500">
            Sessions appear here when users sign in.
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
              <th className="text-left px-4 py-3 font-medium text-slate-500">Last active</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Device</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <User className="size-4 text-slate-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">
                        {s.userName ?? "Unknown"}
                        {s.isCurrentSession && (
                          <span className="ml-2 text-xs text-slate-400 font-normal">(you)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{s.userEmail}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600" title={parseSqliteUtc(s.lastActive).toLocaleString()} suppressHydrationWarning>
                  {timeAgo(s.lastActive)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {parseDevice(s.userAgent)}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.isCurrentSession ? (
                    <a
                      href="/admin/login"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Sign out
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRevoke(s.userId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
