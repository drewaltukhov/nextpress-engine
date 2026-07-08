"use client";

import { Cloud, Palette } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { AppearanceTab } from "./AppearanceTab";
import { SettingsTab } from "./SettingsTab";
import type { WeatherSettings } from "./actions";

interface Props {
  initial: WeatherSettings;
}

export function WeatherSettingsClient({ initial }: Props) {
  return (
    <AdminSection
      title="Weather"
      description="Configure the weather widget that appears on your dashboard."
      tabs={[
        {
          value: "appearance",
          label: "Appearance",
          icon: <Palette className="size-4" />,
          content: <AppearanceTab initial={initial} />,
        },
        {
          value: "settings",
          label: "Settings",
          icon: <Cloud className="size-4" />,
          content: <SettingsTab initial={initial} />,
        },
      ]}
    />
  );
}
