"use client";

import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  type?: "text" | "number";
  value: string | number;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Tailwind width class, e.g. `w-32`. Defaults to `w-40`. */
  width?: string;
  /** Set when the input should render in a monospace face (hex, sizes). */
  mono?: boolean;
  spellCheck?: boolean;
}

/**
 * Short, right-aligned text/number input shaped as a pill. Used for
 * the rare cases where a row needs free-form text (e.g. Custom width
 * "1280px") and the value is short enough to read at a glance.
 */
export function PillInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  width = "w-40",
  mono = false,
  spellCheck,
}: Props) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={spellCheck}
      className={cn(
        "h-9 rounded-full border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm",
        "placeholder:text-slate-400 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30",
        mono && "font-mono text-xs",
        width,
      )}
    />
  );
}
