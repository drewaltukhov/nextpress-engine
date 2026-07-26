/**
 * Admin-only editor field for the Layout block's "Mobile column order".
 *
 * This field renders `MobileColOrderField`, which calls Puck's `usePuck`
 * hook — importing it pulls the entire Puck EDITOR (~0.5 MiB) into whatever
 * bundle references it. Layout.tsx is imported by the public render path (for
 * its `render`), so keeping this field there dragged the editor onto every
 * public page. Hosting it here — imported ONLY by the admin fields barrel —
 * keeps `usePuck`/the editor out of public bundles; `withAdminFields` merges
 * it back for the admin `<Puck>` editor.
 *
 * Plain static import — no `next/dynamic` (which throws `useContext null` on
 * the production build from Puck's server `<Render>` graph).
 */
import type { ComponentConfig } from "@measured/puck";
import type { ReactElement } from "react";
import { registerBlockFields } from "@core/blocks/registry";
import { MobileColOrderField } from "./MobileColOrderField";
import type { LayoutProps } from "./Layout";

function renderMobileColOrderField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: number[] | undefined) => void;
}): ReactElement {
  return <MobileColOrderField value={value} onChange={onChange} />;
}

registerBlockFields("Layout", {
  mobileColOrder: {
    type: "custom",
    label: "Mobile column order",
    render: renderMobileColOrderField,
  },
} as unknown as ComponentConfig<LayoutProps>["fields"]);
