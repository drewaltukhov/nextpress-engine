"use client";

import { useEffect, useState } from "react";
import { loadAvailableMenuLocations, type AvailableMenuLocation } from "@core-plugins/menus";

const selectCls =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Custom Puck field input that lets the user pick a menu by its
 * location string. Used by the `NavMenu` block so the picker UX (and
 * the empty/error states) stay consistent across surfaces.
 */
export function MenuLocationPickerInput({ value, onChange }: Props) {
  const [items, setItems] = useState<AvailableMenuLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAvailableMenuLocations()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e: unknown) => {
        if (active) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load menus");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (items === null) {
    return <div className="text-xs text-slate-400">Loading menus…</div>;
  }

  return (
    <div className="space-y-1.5">
      <select
        className={selectCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">None</option>
        {items.map((m) => (
          <option key={m.location} value={m.location}>
            {m.name} ({m.location})
          </option>
        ))}
      </select>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
          No menus with a location yet.{" "}
          <a
            href="/admin/menus"
            className="text-brand-green underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create one →
          </a>
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
