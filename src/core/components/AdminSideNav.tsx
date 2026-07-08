"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
import { hasPermission } from "@core-plugins/users/permissions";
import { useAdminShell } from "./AdminShellContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Nav data
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: string; // SVG path d
  disabled?: boolean;
  /** When true, this single item is hidden for non-admin users. */
  adminOnly?: boolean;
  /** Hidden unless the user holds this permission (e.g. "topics.manage"). */
  requiresPermission?: string;
  /** Renders the link in red as a destructive-action affordance. */
  tone?: "danger";
}

interface NavGroup {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
  /** When true, the whole group is hidden for non-admin users. */
  adminOnly?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "",
    defaultOpen: true,
    items: [
      { label: "Dashboard", href: "/admin", icon: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" },
    ],
  },
  {
    title: "Content",
    defaultOpen: true,
    items: [
      { label: "Posts", href: "/admin/posts", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8", requiresPermission: "posts.draft" },
      { label: "Pages", href: "/admin/pages", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6", requiresPermission: "pages.draft" },
      { label: "Topics", href: "/admin/topics", icon: "M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z", requiresPermission: "topics.manage" },
      { label: "Media", href: "/admin/media", icon: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M11 9a2 2 0 1 0-4 0 2 2 0 0 0 4 0z M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" },
      { label: "SEO", href: "/admin/seo", icon: "m21 21-4.3-4.3 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z M11 7v8 M7 11h8", adminOnly: true },
    ],
  },
  {
    title: "Appearance",
    adminOnly: true,
    items: [
      { label: "Themes", href: "/admin/themes", icon: "M12 3a9 9 0 1 0 0 18c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.92.746-1.668 1.668-1.668H16c2.761 0 5-2.239 5-5 0-3.866-4.03-7-9-7z", requiresPermission: "themes.manage" },
      { label: "Menus", href: "/admin/menus", icon: "M3 6h18 M3 12h18 M3 18h18", requiresPermission: "menus.manage" },
    ],
  },
  {
    title: "People",
    adminOnly: true,
    items: [
      { label: "Users", href: "/admin/users", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" },
      { label: "Roles", href: "/admin/roles", icon: "M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z m4-9.5L21 2 m-2 6 3-3 m-3 0 3 3" },
    ],
  },
  {
    title: "Integrations",
    adminOnly: true,
    items: [
      { label: "Plugins", href: "/admin/plugins", icon: "M9 9h6v6H9z M9 2v6 M15 2v6 M9 22v-6 M15 22v-6 M2 9h6 M2 15h6 M16 9h6 M16 15h6" },
      { label: "API Tokens", href: "/admin/api-tokens", icon: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z M12 9v4 M12 17h.01" },
    ],
  },
  {
    title: "System",
    adminOnly: true,
    items: [
      { label: "Settings", href: "/admin/settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .66.39 1.26 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82c.25.61.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.26.39-1.51 1z" },
      { label: "Redirects", href: "/admin/redirects", icon: "m17 1 4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3" },
      { label: "Updates", href: "/admin/updates", icon: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M21 21v-5h-5" },
      { label: "Security", href: "/admin/security", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
      { label: "Logs", href: "/admin/logs", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8" },
      { label: "Backup", href: "/admin/backup", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" },
      { label: "Reset", href: "/admin/reset", icon: "M3 12a9 9 0 1 0 3-6.7 M3 4v5h5", tone: "danger" },
    ],
  },
];

// Documentation link doesn't live in NAV_GROUPS — it's pinned to the footer
// next to the Collapse button so the icon row pairs visually with it.
const DOCS_ICON =
  "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20 M8 7h8 M8 11h6";

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 size-4"
    >
      <path d={d} />
    </svg>
  );
}

function CollapsibleGroup({ group, pathname, collapsed }: { group: NavGroup; pathname: string; collapsed: boolean }) {
  const hasActiveChild = group.items.some(
    (item) => !item.disabled && (item.href === pathname || (item.href !== "/admin" && pathname.startsWith(item.href)))
  );
  const [open, setOpen] = useState(group.defaultOpen ?? hasActiveChild);

  // Top-level items (no group title) — always visible
  if (!group.title) {
    return (
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </div>
    );
  }

  // Collapsed mode — just show icons, no group headers
  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 text-start">
          {group.title}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-0.5 ms-2.5">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} collapsed={false} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const isActive = !item.disabled && (
    item.href === "/admin"
      ? pathname === "/admin" || pathname === "/admin/"
      : pathname.startsWith(item.href)
  );

  const icon = <NavIcon d={item.icon} />;

  const isDanger = item.tone === "danger";

  // Collapsed: icon-only with tooltip
  if (collapsed) {
    const cls = `flex items-center justify-center rounded-lg p-2 transition-colors ${
      item.disabled
        ? "text-fd-muted-foreground/40 cursor-not-allowed"
        : isActive
          ? isDanger
            ? "bg-red-50 text-red-700"
            : "bg-fd-primary/10 text-fd-primary"
          : isDanger
            ? "text-red-600 hover:bg-red-50 hover:text-red-700"
            : "text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80"
    }`;

    return (
      <Tooltip>
        <TooltipTrigger className={cls} render={item.disabled ? <span /> : <a href={item.href} />}>
          {icon}
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  // Expanded: full label
  if (item.disabled) {
    return (
      <span className="flex items-center gap-2 rounded-lg p-2 ps-4 text-sm text-fd-muted-foreground/40 cursor-not-allowed">
        {icon}
        {item.label}
      </span>
    );
  }

  return (
    <a
      href={item.href}
      data-active={isActive}
      className={`relative flex items-center gap-2 rounded-e-lg p-2 ps-3 text-sm transition-colors border-l-2 ${
        isActive
          ? isDanger
            ? "border-red-600 bg-red-50 text-red-700 font-medium"
            : "border-brand-green bg-brand-light-green/50 text-brand-navy font-medium"
          : isDanger
            ? "border-transparent text-red-600 hover:bg-red-50 hover:text-red-700 hover:transition-none"
            : "border-transparent text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none"
      }`}
    >
      {icon}
      {item.label}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface PluginNavItem {
  label: string;
  href: string;
  icon: string;
}

interface AdminSideNavProps {
  pluginNavItems?: PluginNavItem[];
  isAdmin?: boolean;
  /** Effective permission strings for the signed-in user (admin's `*` covers everything). */
  permissions?: readonly string[];
}

export function AdminSideNav({
  pluginNavItems = [],
  isAdmin = false,
  permissions = [],
}: AdminSideNavProps) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAdminShell();

  const permsSet = useMemo(() => new Set(permissions), [permissions]);

  // Inject enabled plugin nav items into the Integrations group, drop
  // adminOnly items the current user can't see, drop items whose
  // requiresPermission isn't satisfied, then drop groups that are
  // admin-only — or end up empty after item-level filtering.
  const groups = NAV_GROUPS
    .map((group) => {
      let items = group.items;
      if (group.title === "Integrations" && pluginNavItems.length > 0) {
        const pluginsIdx = items.findIndex((i) => i.href === "/admin/plugins");
        items = [...items];
        items.splice(pluginsIdx + 1, 0, ...pluginNavItems);
      }
      if (!isAdmin) {
        items = items.filter((item) => !item.adminOnly);
      }
      items = items.filter(
        (item) => !item.requiresPermission || hasPermission(permsSet, item.requiresPermission),
      );
      return { ...group, items };
    })
    .filter((group) => (!group.adminOnly || isAdmin) && group.items.length > 0);

  return (
    <aside
      className={`fixed top-14 bottom-0 left-0 bg-fd-card border-e border-fd-border z-30 flex flex-col transition-[width] duration-200 ${
        sidebarCollapsed ? "w-[52px]" : "w-[268px]"
      }`}
    >
      <div className={`flex-1 overflow-y-auto flex flex-col gap-1 text-sm ${sidebarCollapsed ? "p-1.5" : "p-4"}`}>
        {groups.map((group) => (
          <CollapsibleGroup
            // Untitled groups (top Dashboard, bottom Documentation) used to
            // both fall back to "_top", causing a React duplicate-key warning
            // and a hydration mismatch. Fall back to the first item's href
            // since that's stable and unique per group.
            key={group.title || group.items[0]?.href || "_unknown"}
            group={group}
            pathname={pathname}
            collapsed={sidebarCollapsed}
          />
        ))}
      </div>

      <div className={`border-t border-fd-border bg-fd-card flex flex-col gap-0.5 ${sidebarCollapsed ? "p-1.5" : "p-2"}`}>
        <Tooltip>
          <TooltipTrigger
            render={<a href="/docs" />}
            className={`flex items-center gap-2 rounded-lg p-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 w-full ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <NavIcon d={DOCS_ICON} />
            {!sidebarCollapsed && <span>Documentation</span>}
          </TooltipTrigger>
          {sidebarCollapsed && <TooltipContent side="right">Documentation</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            onClick={toggleSidebar}
            className={`flex items-center gap-2 rounded-lg p-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 w-full ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <PanelLeft
              className={`size-4 shrink-0 transition-transform duration-200 ${sidebarCollapsed ? "rotate-180" : ""}`}
            />
            {!sidebarCollapsed && <span>Collapse</span>}
          </TooltipTrigger>
          {sidebarCollapsed && (
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}
