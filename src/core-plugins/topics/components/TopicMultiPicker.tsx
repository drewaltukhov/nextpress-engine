"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { loadAvailableTopics, type AvailableTopic } from "../picker-actions";

interface Props {
  /** Selected topic slugs. `[]` is the "no narrowing" state — every
   *  checkbox renders as ticked, and consumers should treat it as
   *  "all topics" (no filter). Match `PillarMultiPicker`'s contract
   *  so both pickers behave the same in Newspaper widget fields. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-topic checkbox dropdown — mirrors PillarMultiPicker's visual
 * + interaction model so the two pickers feel the same in the Puck
 * field inspector. Click-order determines the array order, which is
 * what Newspaper Section Hero / Section Featured use to lay out their
 * tab strips (no explicit up/down reorder controls — pick in the
 * order you want).
 */
export function TopicMultiPicker({ value, onChange }: Props) {
  const [items, setItems] = useState<AvailableTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadAvailableTopics()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e: unknown) => {
        if (active) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load topics");
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
    return <div className="text-xs text-slate-400">Loading topics…</div>;
  }

  const total = items.length;
  const allOn = value.length === 0;
  const isChecked = (slug: string) => allOn || value.includes(slug);
  const checkedCount = allOn ? total : value.length;

  function toggle(slug: string) {
    if (allOn) {
      onChange(items!.filter((t) => t.slug !== slug).map((t) => t.slug));
      return;
    }
    const next = value.includes(slug)
      ? value.filter((s) => s !== slug)
      : [...value, slug];
    if (next.length === total) {
      onChange([]);
    } else {
      onChange(next);
    }
  }

  function selectAll() {
    onChange([]);
  }
  function clearAll() {
    if (items && items.length > 0) onChange([items[0].slug]);
  }

  const summary =
    allOn
      ? total === 0
        ? "No topics yet"
        : `All topics (${total})`
      : checkedCount === 0
        ? "No topics selected"
        : checkedCount === 1
          ? "1 topic"
          : `${checkedCount} of ${total} topics`;

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
                No topics yet.{" "}
                <a
                  href="/admin/topics"
                  className="text-brand-green underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create one →
                </a>
              </div>
            ) : (
              items.map((t) => {
                const checked = isChecked(t.slug);
                return (
                  <label
                    key={t.slug}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(t.slug)}
                      className="size-4 shrink-0 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                    />
                    <span className="flex-1 text-sm text-slate-900">{t.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">/{t.slug}</span>
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
