"use client";

import { cn } from "@/lib/utils";

interface Props {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When the card needs to span both columns of the parent grid. */
  span?: "single" | "full";
}

/**
 * Lightweight card that groups inline SettingRows under a single
 * meaning. Sits inside a `grid gap-4 lg:grid-cols-2 items-start`
 * wrapper provided by the consumer.
 */
export function SettingsCard({ title, children, className, span = "single" }: Props) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5",
        span === "full" && "lg:col-span-2",
        className,
      )}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
