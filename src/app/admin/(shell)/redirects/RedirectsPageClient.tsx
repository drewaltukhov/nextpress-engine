"use client";

import { ListChecks, Settings } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { ManageTab } from "./ManageTab";
import { SettingsTab } from "./SettingsTab";
import type { RedirectListItem } from "@core-plugins/redirects";
import type { RedirectsSettings } from "./actions";

interface Props {
  redirects: RedirectListItem[];
  settings: RedirectsSettings;
  defaultTab?: string;
}

export function RedirectsPageClient({ redirects, settings, defaultTab }: Props) {
  return (
    <AdminSection
      title="Redirects"
      description="Send visitors from old URLs to new ones — manually or automatically when you rename content."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "manage",
          label: "Manage",
          icon: <ListChecks className="size-4" />,
          content: <ManageTab initial={redirects} defaultStatus={settings.defaultStatus} />,
        },
        {
          value: "settings",
          label: "Settings",
          icon: <Settings className="size-4" />,
          content: <SettingsTab initial={settings} />,
        },
      ]}
    />
  );
}
