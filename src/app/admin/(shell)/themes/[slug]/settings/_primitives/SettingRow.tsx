"use client";

import { cn } from "@/lib/utils";

interface Props {
  /** Setting label (sm/medium). */
  label: React.ReactNode;
  /** Optional helper text rendered under the label. */
  description?: React.ReactNode;
  /** The control rendered on the right side of the row. */
  control: React.ReactNode;
  /** Pass-through `htmlFor` so the label is associated with the control. */
  htmlFor?: string;
  className?: string;
}

/**
 * One horizontal settings row: label + optional description on the
 * left, single control on the right. Border-bottom is collapsed on
 * the last row in each section by the `last:border-b-0` utility.
 */
export function SettingRow({ label, description, control, htmlFor, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}
