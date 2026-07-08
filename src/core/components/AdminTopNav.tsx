"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Image as ImageIcon, Plus, Tag, FileType } from "lucide-react";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";
import { useAdminShell } from "./AdminShellContext";
import { UserAvatar } from "./UserAvatar";
import { NotificationsBell } from "./NotificationsBell";
import { useCommandPalette } from "./CommandPalette";

interface Props {
  user: { name: string; email: string; avatarUrl?: string | null };
  permissions: readonly string[];
}

interface NewMenuItem {
  label: string;
  href: string;
  description: string;
  permission: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Order chosen to match the most common authoring flow: post → page →
// taxonomy → media. Each entry lists the permission that gates it; the
// menu hides items the actor can't use rather than disabling them, so
// authors and editors see a sensibly-sized list.
const NEW_MENU: ReadonlyArray<NewMenuItem> = [
  {
    label: "Post",
    href: "/admin/posts/new",
    description: "Blog post — pillar, spike, or standalone.",
    permission: "posts.draft",
    icon: FileText,
  },
  {
    label: "Page",
    href: "/admin/pages/new",
    description: "Static content (about, contact, landing).",
    permission: "pages.draft",
    icon: FileType,
  },
  {
    // Topics + Media don't have dedicated /new pages — creation lives in
    // a dialog (Topics) or a tab (Media) on the listing page. The menu
    // links to those pages with a query flag so they auto-open the
    // creation surface on mount, matching the spirit of "+ New".
    label: "Topic",
    href: "/admin/topics?new=1",
    description: "Tag posts with a new topic.",
    permission: "topics.manage",
    icon: Tag,
  },
  {
    label: "Media",
    href: "/admin/media?tab=upload",
    description: "Upload images to the library.",
    permission: "media.add",
    icon: ImageIcon,
  },
];

function hasPermission(perms: readonly string[], required: string): boolean {
  if (perms.includes("*")) return true;
  if (perms.includes(required)) return true;
  // Legacy `${entity}.*` wildcards — same shape ROLE_ENTITIES.hasGrade
  // honors. Handles the case where a custom role grants posts.* but
  // not the explicit posts.draft permission.
  const dot = required.indexOf(".");
  if (dot > 0 && perms.includes(`${required.slice(0, dot)}.*`)) return true;
  return false;
}

export function AdminTopNav({ user, permissions }: Props) {
  const { sidebarCollapsed } = useAdminShell();
  const { openPalette } = useCommandPalette();

  return (
    <header className="fixed top-0 inset-x-0 h-14 bg-brand-navy text-white z-40">
      <div className="h-full flex items-center pr-4">
        {/* Logo block — width-matches the sidebar so the right edges align,
            collapses to just the green brace when the sidebar collapses. */}
        <a
          href="/admin"
          className={`flex items-center justify-center border-r border-white/10 h-full text-white shrink-0 transition-[width] duration-200 ${
            sidebarCollapsed ? "w-[52px]" : "w-[268px]"
          }`}
        >
          {sidebarCollapsed ? (
            <span className="text-brand-green font-bold text-2xl leading-none">{"}"}</span>
          ) : (
            <Logo className="h-6 w-auto" />
          )}
        </a>

        <div className="flex-1 max-w-xl ml-4">
          <button
            type="button"
            onClick={openPalette}
            className="w-full flex items-center gap-2.5 h-9 px-3 rounded-md bg-white/10 hover:bg-white/15 text-sm text-white/70 hover:text-white transition"
            title="Search admin (⌘K)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>Search posts, pages, users, topics, media…</span>
            <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/20 text-white/60">⌘K</span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <NewMenu permissions={permissions} />

          <NotificationsBell />

          <div className="mx-2 h-6 w-px bg-white/15" aria-hidden />

          {/* User cluster */}
          <div className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-white/10 transition">
            <a
              href="/admin/profile"
              className="flex items-center gap-2 text-white"
              title="Your profile"
            >
              <UserAvatar
                name={user.name}
                email={user.email}
                url={user.avatarUrl}
                size={28}
                className="text-sm"
              />
              <span className="text-sm text-white/80 hidden sm:inline">{user.name}</span>
            </a>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── + New menu ─────────────────────────────────────────────────────────
//
// Inline button + popover. The project doesn't ship a generic Popover
// primitive (only Dialog/Select), so we roll a small click-outside +
// ESC close handler — same pattern as TopicsMultiSelect on the posts
// list. Visible items are filtered by permission so authors don't see
// "Topic" they can't create.

function NewMenu({ permissions }: { permissions: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const visibleItems = NEW_MENU.filter((item) =>
    hasPermission(permissions, item.permission),
  );

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

  // No permitted items = hide the button entirely. Showing a disabled
  // shell would be misleading; the user can't act on it from any path.
  if (visibleItems.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 h-9 pl-2.5 pr-2 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green/90 transition-colors"
      >
        <Plus className="size-3.5" strokeWidth={2.5} />
        New
        <ChevronDown
          className={`size-3.5 text-white/80 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden z-50"
        >
          <div className="py-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-md bg-brand-light-green/40 text-brand-navy shrink-0">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium leading-tight">{item.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
