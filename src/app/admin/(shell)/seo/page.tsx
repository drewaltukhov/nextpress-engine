import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { getSeoSettings } from "./actions";
import { SeoPageClient } from "./SeoPageClient";

export const metadata: Metadata = { title: "SEO" };

const TABS = ["general", "sitemap", "robots", "verification", "identity", "schemas"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SeoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    redirect("/admin");
  }

  const [settings, params] = await Promise.all([getSeoSettings(), searchParams]);
  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue =
    requested && TABS.includes(requested) ? requested : "general";

  return <SeoPageClient settings={settings} defaultTab={defaultTab} />;
}
