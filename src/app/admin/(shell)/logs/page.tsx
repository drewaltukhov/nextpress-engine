import type { Metadata } from "next";
import { getActivity, getFailedLogins, getActiveSessions, getUsers, getLogSettings } from "./actions";
import { LogsPageClient } from "./LogsPageClient";

export const metadata: Metadata = { title: "Logs" };

const TABS = ["activity", "logins", "sessions", "settings"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function LogsPage({ searchParams }: PageProps) {
  const [activity, failedLogins, sessions, users, logSettings, params] = await Promise.all([
    getActivity(),
    getFailedLogins(),
    getActiveSessions(),
    getUsers(),
    getLogSettings(),
    searchParams,
  ]);
  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue = requested && TABS.includes(requested) ? requested : "activity";

  return (
    <LogsPageClient
      activity={activity}
      failedLogins={failedLogins}
      sessions={sessions}
      users={users}
      logSettings={logSettings}
      defaultTab={defaultTab}
    />
  );
}
