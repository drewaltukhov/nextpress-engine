"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  /** Accessible name — the switch renders no text of its own, so callers
   *  must name it (or associate a <label htmlFor> via `id`). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700",
        className
      )}
    >
      {name && <input type="hidden" name={name} value={checked ? "true" : "false"} />}
      <span
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

export { Switch, type SwitchProps };
