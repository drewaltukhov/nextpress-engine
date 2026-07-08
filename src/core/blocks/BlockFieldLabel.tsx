import type { ReactNode } from "react";

/**
 * Local replacement for Puck's `FieldLabel`, used to add a label above
 * `type: "custom"` field renders. We can't import Puck's `FieldLabel`
 * because:
 *
 *   - It's only exported from the editor bundle (`@measured/puck`,
 *     default condition), not the RSC bundle (`react-server`
 *     condition).
 *   - This file ships in modules imported by the plugin loader
 *     during RSC boot — that path resolves `@measured/puck` to the
 *     RSC bundle. Adding `import { FieldLabel } from "@measured/puck"`
 *     fails the build with "Export FieldLabel doesn't exist".
 *
 * We replicate Puck's visual style using its CSS variables
 * (`--puck-color-grey-04`, `--puck-font-size-xxs`) — they're already
 * defined by the editor stylesheet, so the label matches the rest of
 * the inspector without us shipping any new theme tokens.
 *
 * `<div>` (not `<label>`) intentionally — wrapping a Select trigger
 * (a `<button>`) or any other interactive element in `<label>`
 * causes the click to fire twice and trips an a11y lint.
 */
export interface BlockFieldLabelProps {
  label: string;
  children: ReactNode;
}

export function BlockFieldLabel({ label, children }: BlockFieldLabelProps) {
  return (
    <div>
      <div
        style={{
          alignItems: "center",
          color: "var(--puck-color-grey-04)",
          display: "flex",
          paddingBottom: 12,
          fontSize: "var(--puck-font-size-xxs)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
