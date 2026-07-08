"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
  type TimeFormat,
} from "@core/datetime";
import { SIDEBAR_COOKIE } from "@core/components/admin-shell-cookie";

export interface DisplayFormat {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  timezone: string;
}

interface AdminShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  display: DisplayFormat;
}

const AdminShellContext = createContext<AdminShellState>({
  sidebarCollapsed: false,
  toggleSidebar: () => {},
  display: {
    dateFormat: DEFAULT_DATE_FORMAT,
    timeFormat: DEFAULT_TIME_FORMAT,
    timezone: DEFAULT_TIMEZONE,
  },
});

// Puck editor routes — the workspace is dense (left palette + canvas + right
// inspector), so we auto-collapse the admin sidebar on entry and restore it
// on exit. Pages, Posts, and the theme builder share the same editor chrome.
const EDITOR_ROUTE_RE =
  /^\/admin\/(?:(?:pages|posts)\/(?:new|[^/]+\/edit)|themes\/[^/]+\/builder)(\/|$)/;

// Persisted across reloads via a year-long Lax cookie. The server reads
// this in (shell)/layout.tsx (importing SIDEBAR_COOKIE from the plain
// shared `admin-shell-cookie` module — exporting it from THIS file
// breaks because the "use client" directive opaque-ifies non-component
// exports across the server boundary). Manual toggles write the cookie;
// the editor auto-collapse / auto-restore is ephemeral and never touches
// it.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readSidebarCookie(): boolean | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SIDEBAR_COOKIE}=`));
  if (!match) return null;
  return match.split("=")[1] === "collapsed";
}

function writeSidebarCookie(collapsed: boolean) {
  if (typeof document === "undefined") return;
  const value = collapsed ? "collapsed" : "expanded";
  document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

interface AdminShellProviderProps {
  children: ReactNode;
  display: DisplayFormat;
  /** Initial collapsed state read from the SIDEBAR_COOKIE on the server. */
  initialSidebarCollapsed?: boolean;
}

export function AdminShellProvider({
  children,
  display,
  initialSidebarCollapsed = false,
}: AdminShellProviderProps) {
  const pathname = usePathname();

  // If the first paint lands on an editor route, start collapsed regardless
  // of the cookie — the auto-collapse rule wins on entry. We still remember
  // the user's persisted preference for when they leave the editor.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => initialSidebarCollapsed || EDITOR_ROUTE_RE.test(pathname),
  );
  const inEditorRef = useRef<boolean>(EDITOR_ROUTE_RE.test(pathname));

  useEffect(() => {
    const inEditor = EDITOR_ROUTE_RE.test(pathname);
    const wasInEditor = inEditorRef.current;
    if (inEditor && !wasInEditor) {
      setSidebarCollapsed(true);
    } else if (!inEditor && wasInEditor) {
      setSidebarCollapsed(readSidebarCookie() ?? false);
    }
    inEditorRef.current = inEditor;
  }, [pathname]);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeSidebarCookie(next);
      return next;
    });
  }

  return (
    <AdminShellContext.Provider
      value={{ sidebarCollapsed, toggleSidebar, display }}
    >
      {children}
    </AdminShellContext.Provider>
  );
}

export function useAdminShell() {
  return useContext(AdminShellContext);
}

export function useDisplayFormat(): DisplayFormat {
  return useContext(AdminShellContext).display;
}
