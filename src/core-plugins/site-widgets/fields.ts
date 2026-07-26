/**
 * Admin-only editor-fields barrel for site widgets.
 *
 * Side-effect imports of every site-widget `*.fields.tsx` module, which
 * register their heavy editor fields (media pickers, hex pickers) via
 * `registerBlockFields`. Imported ONLY by the admin editor configs
 * (pages/puck-config.tsx + ThemeBuilderClient.tsx), so the editor JS lands in
 * the admin client bundle and stays out of public bundles. The public
 * site-widgets barrel (`index.ts`) never imports this.
 */
import "./SiteLogo.fields";
import "./HeroTitle.fields";

export {};
