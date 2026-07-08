"use client";

import { useAdminShell } from "./AdminShellContext";
import type { ReactNode } from "react";

export function AdminMainArea({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useAdminShell();

  return (
    <main
      className={`pt-14 transition-[padding-left] duration-200 ${
        sidebarCollapsed ? "pl-[52px]" : "pl-[268px]"
      }`}
    >
      {children}
    </main>
  );
}
