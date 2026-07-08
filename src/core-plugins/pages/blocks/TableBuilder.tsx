"use client";

import { Plus, X } from "lucide-react";
import { HScrollContainer } from "./HScrollContainer";

interface Props {
  value: string[][];
  onChange: (next: string[][]) => void;
  /** When true, shade the first row to indicate it'll render as a
   *  table header on the public page. */
  headerRow: boolean;
}

/**
 * Custom Puck field that edits a 2D grid of cells inline. Each cell is
 * a textarea sized to its content; row + column controls live around
 * the grid for add / remove. Rows are kept rectangular — adding a
 * column appends a cell to every row, and short rows get padded with
 * empty strings on every change.
 */
export function TableBuilder({ value, onChange, headerRow }: Props) {
  const cells = normalize(value);
  const numRows = cells.length;
  const numCols = cells[0]?.length ?? 1;

  function setCell(r: number, c: number, text: string) {
    const next = cells.map((row, i) =>
      i === r ? row.map((cell, j) => (j === c ? text : cell)) : row,
    );
    onChange(next);
  }

  function addRow() {
    const newRow = Array<string>(numCols).fill("");
    onChange([...cells, newRow]);
  }

  function addColumn() {
    onChange(cells.map((row) => [...row, ""]));
  }

  function deleteRow(r: number) {
    if (numRows <= 1) return;
    onChange(cells.filter((_, i) => i !== r));
  }

  function deleteColumn(c: number) {
    if (numCols <= 1) return;
    onChange(cells.map((row) => row.filter((_, i) => i !== c)));
  }

  return (
    // `[contain:inline-size]` keeps the wrapper at parent (inspector)
    // width regardless of the table's content width. Inside, the
    // HScrollContainer renders our own scrollbar so visibility +
    // styling are fully under our control — no platform variance from
    // macOS auto-hide, Firefox tinting, or WebKit fade-out behaviour.
    <div className="space-y-2 [contain:inline-size] overflow-hidden">
      <HScrollContainer>
        <div className="min-w-max p-2">
          {/* Column-delete strip at the top — one tiny × per column. */}
          <div className="flex gap-1 mb-1">
            <div className="w-8 shrink-0" aria-hidden />
            {Array.from({ length: numCols }, (_, c) => (
              <div key={c} className="flex-1 min-w-[8rem]">
                <button
                  type="button"
                  onClick={() => deleteColumn(c)}
                  disabled={numCols <= 1}
                  title="Delete column"
                  aria-label={`Delete column ${c + 1}`}
                  className="mx-auto flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <div className="w-8 shrink-0" aria-hidden />
          </div>

          {/* Rows. */}
          {cells.map((row, r) => {
            const isHeader = headerRow && r === 0;
            return (
              <div key={r} className="flex gap-1 mb-1">
                {/* Row label / header indicator on the left. */}
                <div className="w-8 shrink-0 flex items-center justify-center text-[10px] font-mono text-slate-400">
                  {isHeader ? "TH" : r + (headerRow ? 0 : 1)}
                </div>
                {row.map((cell, c) => (
                  <textarea
                    key={c}
                    value={cell}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    placeholder={isHeader ? "Header" : "Cell"}
                    rows={1}
                    className={`flex-1 min-w-[8rem] resize-y rounded-md border px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition ${
                      isHeader
                        ? "border-brand-light-green bg-brand-light-green/30 font-medium"
                        : "border-slate-200 bg-white"
                    }`}
                  />
                ))}
                {/* Row delete on the right. */}
                <div className="w-8 shrink-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => deleteRow(r)}
                    disabled={numRows <= 1}
                    title="Delete row"
                    aria-label={`Delete row ${r + 1}`}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </HScrollContainer>

      {/* Add-row + add-column controls below the grid. */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="size-3" />
          Add row
        </button>
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="size-3" />
          Add column
        </button>
      </div>
    </div>
  );
}

/**
 * Coerce any incoming value (jagged, empty, or wrong-typed) into a
 * non-empty rectangular grid of strings. Defensive — saved props from
 * older revisions or a malformed paste shouldn't crash the editor.
 */
function normalize(value: unknown): string[][] {
  const rows = Array.isArray(value) ? value : [];
  const rectified = rows
    .map((row) => (Array.isArray(row) ? row.map((c) => (typeof c === "string" ? c : "")) : []))
    .filter((row): row is string[] => Array.isArray(row));
  if (rectified.length === 0) return [["", "", ""], ["", "", ""]];
  const maxCols = Math.max(...rectified.map((r) => r.length), 1);
  return rectified.map((row) => {
    if (row.length === maxCols) return row;
    if (row.length < maxCols) {
      return [...row, ...Array<string>(maxCols - row.length).fill("")];
    }
    return row.slice(0, maxCols);
  });
}
