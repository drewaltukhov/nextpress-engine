"use client";

import { useState } from "react";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = "#cbd5e1";

interface Props {
  value: unknown;
  onChange: (next: string) => void;
}

/**
 * Hex color input used by Separator and several Newspaper widgets'
 * "Header background color" field.
 *
 * The previous version bound the `<input type="text">` directly to a
 * regex-validated computed value, so intermediate keystrokes (`#`, `#d`,
 * etc.) snapped the input back to the fallback every render — typing a
 * full 6-digit hex was impossible. Users could only set a value by
 * pasting or using the native color swatch.
 *
 * Fix: keep an in-progress local string so typing tracks user input
 * verbatim. Push to the parent's `onChange` only on a complete valid
 * hex (live, so the rest of the inspector / preview stays reactive),
 * and reset the local buffer back to the parent's prop on blur if the
 * user left it in an invalid state.
 */
export function HexField({ value, onChange }: Props) {
  const parentHex =
    typeof value === "string" && HEX_RE.test(value) ? value : "";
  const [draft, setDraft] = useState<string>(() => parentHex || FALLBACK);
  // Render-phase sync of local draft to the parent prop. This is the
  // React-recommended pattern for "reset state when a prop changes"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) —
  // calling setState during render replaces the in-progress render
  // before paint, with no extra commit. The previous useEffect version
  // triggered react-hooks/set-state-in-effect and incurred an extra
  // render every time the swatch picker fired.
  const [lastSyncedParent, setLastSyncedParent] = useState<string>(parentHex);
  if (parentHex !== lastSyncedParent) {
    setLastSyncedParent(parentHex);
    setDraft(parentHex || FALLBACK);
  }

  function handleTextChange(next: string) {
    setDraft(next);
    if (HEX_RE.test(next)) onChange(next);
  }

  function handleBlur() {
    if (!HEX_RE.test(draft)) {
      // Invalid leftover (mid-typing, then focus moved on) — snap back
      // to the parent's last good value so the field never displays
      // garbage between sessions.
      setDraft(parentHex || FALLBACK);
    }
  }

  // Swatch picker always emits a valid 6-digit hex, so push straight
  // through. Keep the local draft in sync so the text input mirrors
  // the swatch choice.
  function handleSwatch(next: string) {
    setDraft(next);
    onChange(next);
  }

  const swatchValue = HEX_RE.test(draft) ? draft : FALLBACK;

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={swatchValue}
        onChange={(e) => handleSwatch(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        aria-label="Pick custom color"
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
        placeholder={FALLBACK}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  );
}
