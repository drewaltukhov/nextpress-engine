"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteUser,
  getUserContentSummary,
  getReassignCandidates,
  type UserListItem,
  type UserContentSummary,
  type ReassignCandidate,
} from "./actions";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

const KEEP = "__keep" as const;
type ReassignChoice = string | typeof KEEP;

export function DeleteUserDialog({ user, open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  // Content-attribution state — populated from server actions when the
  // dialog opens. `null` while loading; `UserContentSummary` after fetch.
  const [summary, setSummary] = useState<UserContentSummary | null>(null);
  const [candidates, setCandidates] = useState<ReassignCandidate[]>([]);
  const [reassignChoice, setReassignChoice] = useState<ReassignChoice>(KEEP);

  // Reset on user/open change so a stale password / summary from a
  // previous open doesn't ride into the next delete attempt. prev-value-
  // in-render pattern (see React 19 docs on adjusting state when a prop
  // changes).
  const [prevKey, setPrevKey] = useState({ user, open });
  if (prevKey.user !== user || prevKey.open !== open) {
    setPrevKey({ user, open });
    setPassword("");
    setPwError(null);
    setSummary(null);
    setCandidates([]);
    setReassignChoice(KEEP);
  }

  // Fetch the content summary and the candidate list when a user opens
  // the dialog. Both queries are cheap; running them on open (rather than
  // mount) means we skip work when the dialog is dismissed.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void Promise.all([
      getUserContentSummary(user.id),
      getReassignCandidates(user.id),
    ]).then(([s, c]) => {
      if (cancelled) return;
      setSummary(s);
      setCandidates(c);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const targetIsAdmin = user?.roles.includes("admin") ?? false;
  const hasContent = (summary?.total ?? 0) > 0;

  function handleConfirm() {
    if (!user) return;
    setPwError(null);
    const reassignTo = reassignChoice === KEEP ? null : reassignChoice;
    startTransition(async () => {
      const result = await deleteUser(
        user.id,
        targetIsAdmin ? password : undefined,
        reassignTo,
      );
      if (!result.ok) {
        if (result.reason === "step-up-required" || result.reason === "wrong-password") {
          setPwError(result.error);
          return;
        }
        toast.error(result.error);
        onOpenChange(false);
        return;
      }
      const name = user.displayName || user.email;
      if (result.reassigned && result.reassigned > 0) {
        toast.success(`${name} deleted — ${result.reassigned} item${result.reassigned === 1 ? "" : "s"} reassigned`);
      } else {
        toast.success(`${name} deleted`);
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{targetIsAdmin ? "Delete admin profile" : "Delete user"}</DialogTitle>
        </DialogHeader>

        {user ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Delete{" "}
              <span className="font-medium text-slate-900">{user.email}</span>?
              They&apos;ll lose access immediately and any active sessions
              will be revoked. This action can&apos;t be undone from the UI.
            </p>

            <ContentReassignSection
              summary={summary}
              candidates={candidates}
              choice={reassignChoice}
              onChoiceChange={setReassignChoice}
              hasContent={hasContent}
            />

            {targetIsAdmin && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-slate-700">
                  This is an{" "}
                  <span className="font-semibold text-amber-700">administrator</span>.
                  Re-enter <span className="font-semibold">your own</span>{" "}
                  password to confirm — protects against accidental admin
                  takedowns from a compromised session.
                </p>
                <div>
                  <label htmlFor="delete-pw" className="block text-xs font-medium text-slate-700 mb-1">
                    Your password
                  </label>
                  <input
                    id="delete-pw"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (pwError) setPwError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password.length > 0 && !pending) {
                        e.preventDefault();
                        handleConfirm();
                      }
                    }}
                    className={inputCls}
                    autoFocus
                  />
                  {pwError && (
                    <p className="mt-1 text-xs text-red-600">{pwError}</p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending || (targetIsAdmin && password.length === 0)}
                className="h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Deleting…" : targetIsAdmin ? "Delete admin" : "Delete user"}
              </button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Content reassignment subcomponent — shows the per-surface counts and a
// picker when the target user actually authored / uploaded something. When
// the target has zero content, the section renders nothing so the dialog
// stays compact.
// ---------------------------------------------------------------------------

interface ReassignSectionProps {
  summary: UserContentSummary | null;
  candidates: ReassignCandidate[];
  choice: ReassignChoice;
  onChoiceChange: (next: ReassignChoice) => void;
  hasContent: boolean;
}

function ContentReassignSection({
  summary,
  candidates,
  choice,
  onChoiceChange,
  hasContent,
}: ReassignSectionProps) {
  // Loading: dim placeholder so the dialog doesn't reflow when summary
  // arrives. Empty state: render nothing.
  if (summary === null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
      </div>
    );
  }
  if (!hasContent) return null;

  const lines: string[] = [];
  if (summary.posts > 0) lines.push(`${summary.posts} post${summary.posts === 1 ? "" : "s"}`);
  if (summary.pages > 0) lines.push(`${summary.pages} page${summary.pages === 1 ? "" : "s"}`);
  if (summary.topics > 0) lines.push(`${summary.topics} topic${summary.topics === 1 ? "" : "s"}`);
  if (summary.media > 0) lines.push(`${summary.media} media file${summary.media === 1 ? "" : "s"}`);
  if (summary.galleries > 0) lines.push(`${summary.galleries} galler${summary.galleries === 1 ? "y" : "ies"}`);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Authored content</p>
        <p className="text-xs text-slate-600 mt-0.5">
          This user authored {lines.join(", ")}. Pick someone to inherit it, or
          leave it attributed to the deleted account.
        </p>
      </div>

      <div>
        <label htmlFor="reassign-target" className="block text-xs font-medium text-slate-700 mb-1">
          Reassign to
        </label>
        <Select
          value={choice}
          onValueChange={(v) => onChoiceChange(v as ReassignChoice)}
        >
          <SelectTrigger id="reassign-target" className="h-10 text-sm">
            <SelectValue placeholder="Pick a user">
              {(value) => {
                if (!value || value === KEEP) {
                  return <span className="text-slate-700">Leave attributed to deleted user</span>;
                }
                const c = candidates.find((u) => u.id === value);
                if (!c) return <span className="text-slate-400">—</span>;
                return (
                  <>
                    <span className="font-medium">{c.displayName}</span>
                    <span className="text-slate-400 ml-1">{c.email}</span>
                  </>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={KEEP}>
              <span className="text-slate-700">Leave attributed to deleted user</span>
            </SelectItem>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="font-medium">{c.displayName}</span>
                <span className="text-slate-400 ml-1">{c.email}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {choice === KEEP && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            The deleted user&apos;s name will keep showing as the author on
            existing content. New edits to that content will still be possible
            by users with the right role.
          </p>
        )}
      </div>
    </div>
  );
}
