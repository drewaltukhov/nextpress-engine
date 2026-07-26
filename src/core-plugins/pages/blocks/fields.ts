/**
 * Admin-only editor-fields barrel.
 *
 * Side-effect imports of every `*.fields.tsx` module, which register their
 * heavy editor fields (Tiptap, Puck-editor `usePuck` field) via
 * `registerBlockFields`. This barrel is imported ONLY by the admin editor
 * config (puck-config.tsx / ThemeBuilderClient.tsx), so the editor JS lands in
 * the admin client bundle and stays out of public bundles. The public block
 * barrel (index.ts) never imports this.
 */
import "./RichText.fields";
import "./Layout.fields";
import "./Image.fields";
import "./Banner.fields";
import "./Button.fields";
import "./Gallery.fields";
import "./Hero.fields";

export {};
