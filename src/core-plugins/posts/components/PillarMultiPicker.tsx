"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { loadAvailablePillars, type AvailablePillar } from "@core-plugins/posts/picker-actions";

interface Props {
  /** Selected pillar IDs. `[]` is the "no narrowing" state — the
   *  picker renders every pillar checked (so a fresh widget shows
   *  every pillar's spikes), and the consuming filter treats it as
   *  "fall through to topicSlug". When the user unchecks any pillar
   *  the value flips to the explicit list of still-checked IDs. */
  value: number[];
  onChange: (next: number[]) => void;
}

/**
 * Multi-pillar checkbox dropdown for Puck block fields. Behaves like
 * a single-source-of-truth picker: empty array reads as "all", any
 * non-empty array is the literal selection.
 */
export function PillarMultiPicker({ value, onChange }: Props) {
  const [items, setItems] = useState<AvailablePillar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadAvailablePillars()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e: unknown) => {
        if (active) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load pillars");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Close on outside click. Inline pop-open inspector field — a
  // floating Popover would conflict with Puck's own portal placement,
  // so we just toggle a panel below the trigger.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (items === null) {
    return <div className="text-xs text-slate-400">Loading pillars…</div>;
  }

  const total = items.length;
  // `value: []` represents "all pillars" — render every checkbox as
  // checked. Any non-empty value renders literally.
  const allOn = value.length === 0;
  const isChecked = (id: number) => allOn || value.includes(id);
  const checkedCount = allOn ? total : value.length;

  function toggle(id: number) {
    if (allOn) {
      // Materialize the implicit "all" into an explicit list so the
      // single unchecked id can be removed.
      onChange(items!.filter((p) => p.id !== id).map((p) => p.id));
      return;
    }
    const next = value.includes(id)
      ? value.filter((v) => v !== id)
      : [...value, id];
    // Normalize back to the "all" sentinel when the user re-checks
    // every option — keeps saved data compact and means newly-added
    // pillars auto-include in a widget that was set to "all".
    if (next.length === total) {
      onChange([]);
    } else {
      onChange(next);
    }
  }

  function selectAll() {
    onChange([]); // sentinel for "all"
  }
  function clearAll() {
    // Pick the first pillar so the widget never goes blank from this
    // control (uncheck-all has no useful filter intent). Users can
    // still uncheck-all by unchecking individually.
    if (items && items.length > 0) onChange([items[0].id]);
  }

  const summary =
    allOn
      ? total === 0
        ? "No pillars yet"
        : `All pillars (${total})`
      : checkedCount === 0
        ? "No pillars selected"
        : checkedCount === 1
          ? "1 pillar"
          : `${checkedCount} of ${total} pillars`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
        aria-expanded={open}
      >
        <span className={checkedCount === 0 ? "text-slate-400" : ""}>
          {summary}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-brand-light-green bg-white shadow-lg">
          {items.length > 0 ? (
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px]">
              <button
                type="button"
                onClick={selectAll}
                className="font-medium text-brand-green hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-slate-500 hover:text-slate-900"
              >
                Clear
              </button>
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto p-1">
            {items.length === 0 ? (
              <div className="px-2 py-3 text-xs text-slate-500">
                No pillars yet.{" "}
                <a
                  href="/admin/posts"
                  className="text-brand-green underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create one →
                </a>
              </div>
            ) : (
              items.map((p) => {
                const checked = isChecked(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="size-4 shrink-0 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                    />
                    <span className="flex-1 text-sm text-slate-900">{p.title}</span>
                    <span className="font-mono text-[11px] text-slate-400">/{p.slug}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
