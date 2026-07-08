import type { Metadata } from "next";
import { getPlugins } from "./actions";
import { PluginsPageClient } from "./PluginsPageClient";

export const metadata: Metadata = { title: "Plugins" };

const TABS = ["custom", "system"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function PluginsPage({ searchParams }: PageProps) {
  const [plugins, params] = await Promise.all([getPlugins(), searchParams]);
  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue = requested && TABS.includes(requested) ? requested : "custom";

  return (
    <PluginsPageClient
      plugins={plugins}
      defaultTab={defaultTab}
    />
  );
}
