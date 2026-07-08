"use client";

import { Newspaper, Settings as SettingsIcon } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { NewsTab } from "./NewsTab";
import { SettingsTab } from "./SettingsTab";
import type { GoogleNewsSettings } from "./actions";

interface Props {
  initial: GoogleNewsSettings;
}

export function GoogleNewsSettingsClient({ initial }: Props) {
  return (
    <AdminSection
      title="Google News"
      description="Show top headlines from Google News on your dashboard. No API key required."
      tabs={[
        {
          value: "news",
          label: "News",
          icon: <Newspaper className="size-4" />,
          content: <NewsTab initial={initial} />,
        },
        {
          value: "settings",
          label: "Settings",
          icon: <SettingsIcon className="size-4" />,
          content: <SettingsTab initial={initial} />,
        },
      ]}
    />
  );
}
