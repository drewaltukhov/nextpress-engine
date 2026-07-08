"use client";

import { Puzzle, Shield } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { PluginTable } from "./PluginTable";
import type { PluginListItem } from "./actions";

interface Props {
  plugins: PluginListItem[];
  defaultTab?: string;
}

export function PluginsPageClient({ plugins, defaultTab }: Props) {
  const custom = plugins.filter((p) => p.type === "custom");
  const system = plugins.filter((p) => p.type === "system");

  return (
    <AdminSection
      title="Plugins"
      description="Manage installed plugins. System plugins ship with the engine and can't be removed."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "custom",
          label: "Custom",
          icon: <Puzzle className="size-4" />,
          content: <PluginTable plugins={custom} showType={false} />,
        },
        {
          value: "system",
          label: "System",
          icon: <Shield className="size-4" />,
          content: <PluginTable plugins={system} showType={false} />,
        },
      ]}
    />
  );
}
