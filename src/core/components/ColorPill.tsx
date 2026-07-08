"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Standard gray-scale presets — shared across theme settings and any
 *  block-level color picker so the swatch grid feels consistent across
 *  surfaces. Order: light → dark, plus pure black/white anchors. */
export const GRAY_PRESETS: readonly { label: string; value: string }[] = [
  { label: "White", value: "#ffffff" },
  { label: "Slate 50", value: "#f8fafc" },
  { label: "Slate 100", value: "#f1f5f9" },
  { label: "Slate 200", value: "#e2e8f0" },
  { label: "Slate 400", value: "#94a3b8" },
  { label: "Slate 600", value: "#475569" },
  { label: "Slate 800", value: "#1e293b" },
  { label: "Black", value: "#000000" },
];

interface Preset {
  label: string;
  value: string;
  /** Optional key — used by callers to dedupe the brand preset for
   *  the field that defines that brand color (no-op to pick yourself). */
  key?: string;
}

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  brandPresets: Preset[];
  grayPresets: Preset[];
  /** When set, the swatch chip on the row also shows a "Clear" affordance. */
  allowClear?: boolean;
}

/**
 * Swatch-and-hex pill that opens a popover containing the native
 * color picker, the hex input, optional Clear, and the brand + gray
 * preset rows. Behaviorally identical to the old in-row picker: an
 * empty value means "no override," a 6-digit hex writes through.
 */
export function ColorPill({
  id,
  value,
  onChange,
  brandPresets,
  grayPresets,
  allowClear = true,
}: Props) {
  const isValid = HEX_RE.test(value);
  const hasValue = value.length > 0;
  const popoverId = useId();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1.5 pr-3 text-sm shadow-sm",
          "hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-6 rounded-full border border-slate-200",
            !hasValue &&
              "bg-[length:8px_8px] bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] [background-position:0_0,0_4px,4px_-4px,-4px_0]",
          )}
          style={hasValue && isValid ? { backgroundColor: value } : undefined}
        />
        <span className={cn("font-mono text-xs", hasValue ? "text-slate-700" : "text-slate-400")}>
          {hasValue ? value : "Set color"}
        </span>
      </PopoverTrigger>

      <PopoverContent id={popoverId} className="w-[18rem]">
        <div className="flex items-center gap-2">
          <input
            aria-label="Pick color"
            type="color"
            value={isValid ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-slate-200 p-0 appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#RRGGBB"
            spellCheck={false}
            className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          />
          {allowClear && hasValue ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              title="Clear color"
            >
              Clear
            </button>
          ) : null}
        </div>
        {hasValue && !isValid ? (
          <p className="mt-2 text-xs text-red-600">
            Use a 6-digit hex like <code>#2B944F</code>.
          </p>
        ) : null}

        {brandPresets.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Brand
            </div>
            <div className="flex flex-wrap gap-1.5">
              {brandPresets.map((p) => (
                <PresetDot
                  key={`brand-${p.value}`}
                  preset={p}
                  onPick={(hex) => {
                    onChange(hex);
                    setOpen(false);
                  }}
                  active={p.value.toLowerCase() === value.toLowerCase()}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Grays
          </div>
          <div className="flex flex-wrap gap-1.5">
            {grayPresets.map((p) => (
              <PresetDot
                key={`gray-${p.value}`}
                preset={p}
                onPick={(hex) => {
                  onChange(hex);
                  setOpen(false);
                }}
                active={p.value.toLowerCase() === value.toLowerCase()}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetDot({
  preset,
  onPick,
  active,
}: {
  preset: Preset;
  onPick: (hex: string) => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(preset.value)}
      title={`${preset.label} (${preset.value})`}
      className={cn(
        "size-6 rounded-full border transition-shadow",
        active
          ? "ring-2 ring-brand-green ring-offset-1 border-slate-300"
          : "border-slate-200 hover:ring-2 hover:ring-slate-200",
      )}
      style={{ backgroundColor: preset.value }}
    />
  );
}
