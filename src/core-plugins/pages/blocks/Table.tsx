import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BlockPlaceholder } from "./_placeholder";
import { TableBuilder } from "./TableBuilder";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type TableProps = {
  /** 2D array of cell strings — rectangular (all rows same length).
   *  TableBuilder normalises on every edit so render can trust the shape. */
  cells: string[][];
  headerRow: boolean;
  /** Show row + column dividers inside the table. The outer rounded
   *  border is always rendered; this toggle only affects the internal
   *  grid lines. */
  internalBorders: boolean;
  /** Alternate body row backgrounds for readability ("zebra striping"). */
  zebraRows: boolean;
};

const SAMPLE_CELLS: string[][] = [
  ["Name", "Role", "Started"],
  ["Ada Lovelace", "Mathematician", "1843"],
  ["Alan Turing", "Cryptanalyst", "1936"],
];

function isNonEmpty(cells: string[][]): boolean {
  return cells.some((row) => row.some((cell) => cell.trim() !== ""));
}

/**
 * Parse the legacy `body: string` shape (pipe-separated cells, optional
 * Markdown separator rows, tab-fallback for spreadsheet paste). Used by
 * `resolveData` to migrate Table blocks saved before the builder UI.
 */
function isSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)*\s*\|?$/.test(line);
}

function parseLegacyBody(body: string): string[][] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isSeparatorRow(line))
    .map((line) => {
      const sep = line.includes("|") ? "|" : "\t";
      const cells = line.split(sep).map((c) => c.trim());
      if (cells.length > 0 && cells[0] === "") cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells;
    })
    .filter((row) => row.length > 0);
}

export const Table: ComponentConfig<TableProps> = {
  label: "Table",
  fields: {
    cells: {
      type: "custom",
      label: "Cells",
      // The builder needs to know whether the first row is the header
      // so it can shade it in the inspector. We can't read sibling
      // props from a custom field directly, so the headerRow toggle
      // below sets a separate prop and the build-time render reads it
      // back via the resolveData pass below — but for live editor
      // state we read from the field props' `_meta` shape. Simplest
      // path: render-time without shading is fine; users still see the
      // public-render styling. Pass `false` here to keep the picker
      // simple; we shade based on the saved `headerRow` only when the
      // form re-renders after a toggle.
      render: ({ value, onChange }) => (
        <TableBuilder
          value={Array.isArray(value) ? (value as string[][]) : SAMPLE_CELLS}
          onChange={onChange}
          headerRow={false}
        />
      ),
    },
    headerRow: {
      type: "radio",
      label: "First row is header",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    internalBorders: {
      type: "radio",
      label: "Internal borders",
      options: [
        { label: "Show", value: true },
        { label: "Hide", value: false },
      ],
    },
    zebraRows: {
      type: "radio",
      label: "Zebra rows",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
  },
  defaultProps: {
    cells: SAMPLE_CELLS,
    headerRow: true,
    internalBorders: true,
    zebraRows: false,
  },
  // Migrate the legacy `body: string` shape (pipe / TSV) to the new
  // `cells: string[][]` shape on load. Runs once per block; subsequent
  // saves only carry the new shape so `body` quietly disappears from
  // the row's puckData over time.
  resolveData: (data) => {
    const props = data.props as TableProps & { body?: unknown };
    if (Array.isArray(props.cells) && props.cells.length > 0) return data;
    if (typeof props.body === "string" && props.body.length > 0) {
      const migrated = parseLegacyBody(props.body);
      if (migrated.length > 0) {
        return { ...data, props: { ...props, cells: migrated } };
      }
    }
    return data;
  },
  render: ({ cells, headerRow, internalBorders, zebraRows, puck }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    const rows = Array.isArray(cells) ? cells : [];
    if (puck?.isEditing && md.themeBuilder) {
      const cellCount = rows.length === 0 || !isNonEmpty(rows)
        ? 0
        : rows.length * (rows[0]?.length ?? 0);
      const description = cellCount === 0
        ? "Tabular data — add cells in the inspector."
        : `${rows.length} × ${rows[0]?.length ?? 0}${headerRow ? " · header row" : ""}`;
      return <BuilderCard name="Table" title="Table" description={description} />;
    }
    if (rows.length === 0 || !isNonEmpty(rows)) {
      return (
        <BlockPlaceholder>
          Table — add cells in the Widget Settings panel
        </BlockPlaceholder>
      );
    }

    const headerCells = headerRow ? rows[0] : null;
    const bodyRows = headerRow ? rows.slice(1) : rows;

    // Older saved Table blocks predate `internalBorders` and
    // `zebraRows` — coalesce undefined to the same defaults so they
    // keep their previous look (borders on, no zebra).
    const showBorders = internalBorders ?? true;
    const stripe = zebraRows ?? false;

    // Internal-borders toggle: divide-x on every row gives vertical
    // column dividers, divide-y on tbody gives horizontal row dividers,
    // and the thead's border-b separates header from body. The outer
    // rounded border (on the wrapper div) is always present regardless.
    const headerRowCls = showBorders
      ? "border-b border-slate-200 divide-x divide-slate-100 bg-slate-50"
      : "bg-slate-50";
    const tbodyCls = showBorders ? "divide-y divide-slate-100" : "";
    const bodyRowCls = showBorders ? "divide-x divide-slate-100" : "";

    // `not-prose` so prose's table styling (which zeros padding on the
    // first/last column for a "flush with edges" look) doesn't kick in.
    // Explicit cell padding here gives every column the same horizontal
    // breathing room, including the first.
    return (
      <div className="np-table not-prose mb-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          {headerCells && (
            <thead>
              <tr className={headerRowCls}>
                {headerCells.map((cell, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 text-left font-semibold text-slate-900"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className={tbodyCls}>
            {bodyRows.map((row, ri) => {
              // Stripe every other body row when zebra is on. Start the
              // shading on the second row (index 1) so the row directly
              // under the header stays plain — keeps a clear visual
              // break between header and body.
              const stripeCls = stripe && ri % 2 === 1 ? "bg-slate-50" : "";
              return (
                <tr key={ri} className={`${bodyRowCls} ${stripeCls}`.trim()}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-slate-700 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  },
};

export const TableBlock: Omit<RegisteredBlock, "source"> = {
  name: "Table",
  config: Table,
  surfaces: [
    "page-content",
    "post-content",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-author",
  ],
  category: "Sections",
};
