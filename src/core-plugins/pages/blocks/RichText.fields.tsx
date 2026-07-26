/**
 * Admin-only editor fields for the RichText block.
 *
 * This module imports `RichTextEditor` (Tiptap/ProseMirror, ~388 KiB) and is
 * imported ONLY by the admin editor's fields barrel — never by the public
 * render path. The RichText block itself (RichText.tsx) registers with
 * `fields: {}`, so importing it for its server `render` drags none of Tiptap
 * into public bundles. `withAdminFields` re-attaches these for `<Puck>`.
 *
 * Plain static import — no `next/dynamic` (which throws `useContext null` on
 * the production build when reachable from the Puck server `<Render>` graph).
 */
import type { ComponentConfig } from "@measured/puck";
import { RichTextEditor } from "@core/components/RichTextEditor";
import { registerBlockFields } from "@core/blocks/registry";
import type { RichTextProps } from "./RichText";

export const richTextFields: ComponentConfig<RichTextProps>["fields"] = {
  html: {
    type: "custom",
    label: "Content",
    render: ({ value, onChange }) => (
      <RichTextEditor
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    ),
  },
};

registerBlockFields("RichText", richTextFields);
