import type { Metadata } from "next";
import { getSecurityData } from "./actions";
import { SecurityPageClient } from "./SecurityPageClient";

export const metadata: Metadata = { title: "Security" };

const TABS = ["locked", "countries", "settings"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SecurityPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getSecurityData(), searchParams]);
  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue = requested && TABS.includes(requested) ? requested : "locked";
  return <SecurityPageClient data={data} defaultTab={defaultTab} />;
}
