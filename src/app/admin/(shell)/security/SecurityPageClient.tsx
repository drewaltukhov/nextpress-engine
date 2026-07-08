"use client";

import { Lock, Globe, Settings as SettingsIcon } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { LockedAccountsTab } from "./LockedAccountsTab";
import { CountryAccessTab } from "./CountryAccessTab";
import { SettingsTab } from "./SettingsTab";
import type { SecurityData } from "./actions";

interface Props {
  data: SecurityData;
  defaultTab?: string;
}

export function SecurityPageClient({ data, defaultTab }: Props) {
  return (
    <AdminSection
      title="Security"
      description="Manage account lockouts, country access rules, and login security settings."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "locked",
          label: "Locked Accounts",
          icon: <Lock className="size-4" />,
          content: <LockedAccountsTab rows={data.locked} />,
        },
        {
          value: "countries",
          label: "Country Access",
          icon: <Globe className="size-4" />,
          content: <CountryAccessTab initial={data.country} />,
        },
        {
          value: "settings",
          label: "Settings",
          icon: <SettingsIcon className="size-4" />,
          content: <SettingsTab initial={data.knobs} />,
        },
      ]}
    />
  );
}
