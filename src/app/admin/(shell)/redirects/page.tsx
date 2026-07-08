import type { Metadata } from "next";
import { getRedirects, getRedirectsSettings } from "./actions";
import { RedirectsPageClient } from "./RedirectsPageClient";

export const metadata: Metadata = { title: "Redirects" };

const TABS = ["manage", "settings"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function RedirectsPage({ searchParams }: PageProps) {
  const [redirects, settings, params] = await Promise.all([
    getRedirects(),
    getRedirectsSettings(),
    searchParams,
  ]);
  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue =
    requested && TABS.includes(requested) ? requested : "manage";

  return (
    <RedirectsPageClient
      redirects={redirects}
      settings={settings}
      defaultTab={defaultTab}
    />
  );
}
