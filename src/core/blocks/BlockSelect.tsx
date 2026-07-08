import type { CustomField } from "@measured/puck";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BlockFieldLabel } from "./BlockFieldLabel";

/**
 * Drop-in replacement for Puck's generic `type: "select"` field that
 * renders the project's shared shadcn/base-ui Select instead of the
 * default browser `<select>`.
 *
 * Why no `"use client"` here even though the returned render uses
 * client components: `blockSelectField()` is a *factory* called at
 * block-module-load time, which happens in BOTH the server (plugin
 * loader during boot) and the client (theme builder import side
 * effect) contexts. Marking the file `"use client"` would make this
 * function a client reference, and the next plugin boot would crash
 * with "cannot invoke client function from server". The file itself
 * doesn't use hooks; only the JSX returned by the per-render closure
 * does — and Puck only invokes that closure in the editor (client),
 * where the imported Select primitives resolve normally.
 *
 * Why one helper instead of inlining the wiring per block: every Puck
 * select needs the same SelectValue function-child to make the trigger
 * show the option's `label` rather than its raw `value` (a recurring
 * issue tracked in the per-theme settings forms — base-ui's
 * SelectValue auto-renders the value, not the matched item's text).
 * Centralising it keeps all 12 conversion sites uniform and removes a
 * tripwire from future block authors.
 *
 * Number-valued options (e.g. `gridColumns: 2 | 3 | 4`) round-trip
 * through string keys for the Select primitive and back to the
 * original value via a per-call options lookup — Puck blocks see no
 * type change.
 */
export interface BlockSelectOption<V extends string | number> {
  label: string;
  value: V;
  /** Optional CSS color (hex, named color, or `var(...)`). When set,
   *  a small dot is rendered before the label in both the trigger
   *  and the dropdown items so colorways are pickable by eye, not
   *  just by name. */
  swatch?: string;
}

interface BlockSelectFieldArgs<V extends string | number> {
  label: string;
  options: ReadonlyArray<BlockSelectOption<V>>;
  /** Trigger placeholder shown when no value is selected. */
  placeholder?: string;
  /** Tailwind classes appended to the trigger. */
  triggerClassName?: string;
}

function SelectOptionLabel<V extends string | number>({
  option,
}: {
  option: BlockSelectOption<V>;
}) {
  if (!option.swatch) return <>{option.label}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        style={{ backgroundColor: option.swatch }}
        className="inline-block size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
      />
      <span>{option.label}</span>
    </span>
  );
}

export function blockSelectField<V extends string | number>(
  args: BlockSelectFieldArgs<V>,
): CustomField<V> {
  const placeholder = args.placeholder ?? "Select…";
  return {
    type: "custom",
    label: args.label,
    render: ({ value, onChange }) => {
      const stringValue =
        value !== undefined && value !== null ? String(value) : "";
      // Puck's `type: "custom"` doesn't auto-render the field `label`
      // the way `type: "select"` / `"text"` do. Puck's exported
      // `FieldLabel` lives in the editor bundle and is absent from the
      // RSC bundle, but this file is imported by the plugin loader
      // server-side at boot — so we use a small local component that
      // matches Puck's label styling instead.
      return (
        <BlockFieldLabel label={args.label}>
          <Select
            value={stringValue}
            onValueChange={(v) => {
              if (v == null) return;
              const opt = args.options.find((o) => String(o.value) === v);
              if (opt) onChange(opt.value);
            }}
          >
            <SelectTrigger
              className={`h-10 text-sm ${args.triggerClassName ?? ""}`.trim()}
            >
              <SelectValue placeholder={placeholder}>
                {(raw) => {
                  if (typeof raw !== "string" || raw === "") return placeholder;
                  const opt = args.options.find((o) => String(o.value) === raw);
                  if (!opt) return placeholder;
                  return <SelectOptionLabel option={opt} />;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {args.options.map((o) => (
                <SelectItem key={String(o.value)} value={String(o.value)}>
                  <SelectOptionLabel option={o} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </BlockFieldLabel>
      );
    },
  };
}
