"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string;
  options: Option[];
  onValueChange: (next: string) => void;
  placeholder?: string;
  /** Minimum width of the trigger pill, in Tailwind units. Defaults to a reasonable 10rem. */
  minWidth?: string;
}

/**
 * Compact Select styled as a pill — for right-aligned use inside a
 * SettingRow. Wraps `@/components/ui/select` (the existing Base UI
 * wrapper) so behavior, animations, and a11y are unchanged.
 */
export function PillSelect({
  id,
  value,
  options,
  onValueChange,
  placeholder,
  minWidth = "min-w-[10rem]",
}: Props) {
  const labelByValue = new Map(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} onValueChange={(v) => v && onValueChange(v)}>
      <SelectTrigger
        id={id}
        className={cn(
          "h-9 rounded-full border-slate-200 bg-white px-3.5 text-sm shadow-none",
          minWidth,
        )}
      >
        <SelectValue placeholder={placeholder ?? "Select…"}>
          {(v) =>
            typeof v === "string" && labelByValue.has(v)
              ? labelByValue.get(v)
              : (placeholder ?? "Select…")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
