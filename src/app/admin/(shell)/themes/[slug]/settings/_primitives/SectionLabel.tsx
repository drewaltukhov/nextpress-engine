"use client";

import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Small uppercase divider used to group inline setting rows. Sits in
 * the flow above the first row of each section. No card, no border —
 * the rule below each row provides the visual separation.
 */
export function SectionLabel({ children, className }: Props) {
  return (
    <div
      className={cn(
        "mt-6 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
