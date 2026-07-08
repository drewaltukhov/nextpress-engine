"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, KeyRound, Mail, MailWarning, ShieldAlert } from "lucide-react";
import {
  getMyNotifications,
  type NotificationItem,
  type NotificationSeverity,
} from "@/app/admin/(shell)/profile/notifications-actions";

/**
 * Personal action-queue bell in the admin topbar. Fetches the actor's
 * outstanding items on mount, shows a dot when anything's there, and
 * opens a small popover with the list on click.
 *
 * Same click-outside / ESC pattern as the New menu and the topics
 * multi-select on the posts list — the project doesn't ship a generic
 * Popover primitive, so we roll a thin one each time.
 *
 * Re-fetch trigger: the action runs once on mount per shell render. A
 * `router.refresh()` after a profile mutation (cancelling a pending
 * email change, etc.) re-renders the layout, which remounts the topbar,
 * which triggers a fresh fetch. No live polling — these items don't
 * change frequently enough to warrant the extra requests.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Initial fetch + refetch on focus return. Keeping the refetch on
  // window-focus means a user who confirms their email in another tab
  // sees the bell update when they switch back, without us paying for
  // periodic polling.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const next = await getMyNotifications();
      if (!cancelled) setItems(next);
    }
    void load();
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const count = items?.length ?? 0;
  const hasItems = count > 0;
  // Severity dot color: pick the most-severe one in the list. Keeps the
  // bell a quiet white when only "info" items are present (we don't ship
  // any today, but the kind enum allows it).
  const dotSeverity: NotificationSeverity | null = !items
    ? null
    : items.find((i) => i.severity === "danger")
      ? "danger"
      : items.find((i) => i.severity === "warning")
        ? "warning"
        : items[0]?.severity ?? null;
  const dotClass =
    dotSeverity === "danger"
      ? "bg-red-500"
      : dotSeverity === "warning"
        ? "bg-amber-400"
        : "bg-brand-green";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          hasItems
            ? `${count} notification${count === 1 ? "" : "s"}`
            : "Notifications — all caught up"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative h-9 w-9 grid place-items-center rounded-md transition-colors ${
          hasItems
            ? "text-white hover:bg-white/10"
            : "text-white/40 hover:text-white/60 hover:bg-white/5"
        }`}
      >
        <Bell className="size-[18px]" strokeWidth={2} />
        {hasItems && (
          <span
            className={`absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-brand-navy ${dotClass}`}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Notifications
            </span>
            {hasItems && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                {count} item{count === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {items === null ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-900">All caught up</p>
              <p className="mt-1 text-xs text-slate-500">
                Nothing needs your attention right now.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <NotificationIcon kind={item.kind} severity={item.severity} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-900 leading-tight">
                        {item.title}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationIcon({
  kind,
  severity,
}: {
  kind: NotificationItem["kind"];
  severity: NotificationSeverity;
}) {
  // Icon picked by kind, color shell picked by severity. New kinds add
  // a case here without touching the parent component.
  const Icon =
    kind === "email-change-pending"
      ? Mail
      : kind === "must-reset-password"
        ? KeyRound
        : kind === "smtp-not-configured"
          ? MailWarning
          : ShieldAlert;
  const shell =
    severity === "danger"
      ? "bg-red-50 text-red-600"
      : severity === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-brand-light-green/40 text-brand-navy";
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-md shrink-0 ${shell}`}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
}
