"use client";

import { Coins, Settings as SettingsIcon } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { AssetsTab } from "./AssetsTab";
import { SettingsTab } from "./SettingsTab";
import type { CryptoBeatSettings } from "./actions";

interface Props {
  initial: CryptoBeatSettings;
}

export function CryptoBeatSettingsClient({ initial }: Props) {
  return (
    <AdminSection
      title="Crypto Beat"
      description="Track up to 10 crypto assets on your dashboard. Powered by CoinGecko."
      tabs={[
        {
          value: "assets",
          label: "Assets",
          icon: <Coins className="size-4" />,
          content: <AssetsTab initial={initial} />,
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
