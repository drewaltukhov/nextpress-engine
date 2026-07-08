"use client";

import { ScrollText, ShieldAlert, Monitor, Settings } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { ActivityTab } from "./ActivityTab";
import { FailedLoginsTab } from "./FailedLoginsTab";
import { SessionsTab } from "./SessionsTab";
import { SettingsTab } from "./SettingsTab";
import type {
  ActivityPage,
  FailedLoginsPage,
  ActiveSession,
  UserOption,
  LogSettings,
} from "./actions";

interface Props {
  activity: ActivityPage;
  failedLogins: FailedLoginsPage;
  sessions: ActiveSession[];
  users: UserOption[];
  logSettings: LogSettings;
  defaultTab?: string;
}

export function LogsPageClient({
  activity,
  failedLogins,
  sessions,
  users,
  logSettings,
  defaultTab,
}: Props) {
  return (
    <AdminSection
      title="Logs"
      description="See what's happening on your site — activity, login attempts, and active sessions."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "activity",
          label: "Activity",
          icon: <ScrollText className="size-4" />,
          content: <ActivityTab initial={activity} users={users} />,
        },
        {
          value: "logins",
          label: "Failed Logins",
          icon: <ShieldAlert className="size-4" />,
          content: <FailedLoginsTab initial={failedLogins} />,
        },
        {
          value: "sessions",
          label: "Sessions",
          icon: <Monitor className="size-4" />,
          content: <SessionsTab sessions={sessions} />,
        },
        {
          value: "settings",
          label: "Settings",
          icon: <Settings className="size-4" />,
          content: <SettingsTab initial={logSettings} />,
        },
      ]}
    />
  );
}
