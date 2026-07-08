import type { Metadata } from "next";
import { getWebsiteSettings } from "./website-actions";
import { getSmtpSettings } from "./smtp-actions";
import { getApiSettings } from "./api-actions";
import { getMaintenanceSettings } from "./maintenance-actions";
import {
  getContentSettings,
  listHomepagePageOptions,
  listHomepageTopicOptions,
  listHomepagePillarOptions,
} from "./content-actions";
import { SettingsPageClient } from "./SettingsPageClient";

export const metadata: Metadata = { title: "Settings" };

const TABS = ["website", "content", "smtp", "api", "maintenance"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const [website, smtp, api, maintenance, content, homepagePages, homepageTopics, homepagePillars, params] =
    await Promise.all([
      getWebsiteSettings(),
      getSmtpSettings(),
      getApiSettings(),
      getMaintenanceSettings(),
      getContentSettings(),
      listHomepagePageOptions(),
      listHomepageTopicOptions(),
      listHomepagePillarOptions(),
      searchParams,
    ]);

  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue = requested && TABS.includes(requested) ? requested : "website";

  return (
    <SettingsPageClient
      website={website}
      smtp={smtp}
      api={api}
      maintenance={maintenance}
      content={content}
      homepagePages={homepagePages}
      homepageTopics={homepageTopics}
      homepagePillars={homepagePillars}
      defaultTab={defaultTab}
    />
  );
}
