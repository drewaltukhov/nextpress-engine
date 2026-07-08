/**
 * Client-safe theme-block registrations for Crypto Beat.
 *
 * This file is side-effect-imported by both the server render path
 * (renderActiveTheme) and the client editors (theme builder, page
 * editor) via `src/generated/plugin-blocks.ts`. It MUST stay
 * client-bundleable — no db, no settings, no server-only imports.
 * The block's `render` reads its data from `puck.metadata.plugins`,
 * which the server-side `theme.metadata` filter handler in
 * `index.tsx` populates.
 */
import type { ComponentConfig } from "@measured/puck";
import type { Surface } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { registerPluginThemeBlocks } from "@core/blocks/plugin-blocks";
import { CryptoBeatWidget } from "./CryptoBeatWidget";
import type { CryptoBeatWidgetData } from "./types";
import pluginManifest from "./plugin.json";

interface CryptoPricesProps {
  showTitle: boolean;
}

const ALL_SURFACES: readonly Surface[] = [
  "page-content",
  "post-content",
  "header",
  "footer",
  "sidebar",
  "template-homepage",
  "template-single-page",
  "template-single-post",
  "template-topic-archive",
  "template-not-found",
  "template-search-results",
  "template-author",
];

const CryptoPricesConfig: ComponentConfig<CryptoPricesProps> = {
  label: "Crypto Prices",
  fields: {
    showTitle: {
      type: "radio",
      label: "Show widget title",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: { showTitle: true },
  render: ({ showTitle, puck }) => {
    if (puck?.isEditing) {
      // Builder preview — `theme.metadata` filter only runs in
      // `renderActiveTheme`, so live prices aren't available inside the
      // editor. Show the standard BuilderCard placeholder (orange tone
      // for plugin accent) the same way every site-widget does in
      // edit mode.
      return (
        <BuilderCard
          tone="orange"
          title="Crypto Prices"
          description={
            showTitle
              ? "Renders the configured crypto assets with current prices and 24h change. Heading visible on the public site."
              : "Renders the configured crypto assets with current prices and 24h change. Heading hidden."
          }
        />
      );
    }
    const slot = (puck?.metadata as { plugins?: Record<string, unknown> })
      ?.plugins?.["crypto-beat"] as CryptoBeatWidgetData | undefined;
    const rows = slot?.rows ?? [];
    const currency = slot?.currency ?? "usd";
    const apiKeyConfigured = slot?.apiKeyConfigured ?? false;
    return (
      <div className="not-prose">
        {showTitle && (
          <h3 className="text-base font-semibold mb-2">Crypto Prices</h3>
        )}
        <CryptoBeatWidget
          rows={rows}
          currency={currency}
          apiKeyConfigured={apiKeyConfigured}
          showAdminCTAs={false}
        />
      </div>
    );
  },
};

registerPluginThemeBlocks({
  slug: "crypto-beat",
  blocks: [
    {
      name: "Prices",
      config: CryptoPricesConfig,
      surfaces: ALL_SURFACES,
      category: "Crypto Beat",
      // Reuse the plugin's admin-nav icon so the widget rail entry and
      // the sidebar match. Single source of truth in `plugin.json`.
      icon: pluginManifest.admin?.icon,
    },
  ],
});
