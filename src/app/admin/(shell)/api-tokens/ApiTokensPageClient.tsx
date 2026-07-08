"use client";

import { KeyRound, Settings, Wand2 } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { MyTokensTab } from "./MyTokensTab";
import { BuildRequestTab } from "./BuildRequestTab";
import { SettingsTab } from "./SettingsTab";
import type { TokenListItem } from "@core-plugins/api";
import type { ApiTokensSettings } from "./actions";

export interface PillarOption {
  id: number;
  title: string;
}
export interface TopicOption {
  id: number;
  name: string;
}
export interface SchemaTypeOption {
  type: string;
  name: string;
}

interface Props {
  tokens: TokenListItem[];
  settings: ApiTokensSettings;
  defaultTab?: string;
  baseUrl: string;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
}

export function ApiTokensPageClient({
  tokens,
  settings,
  defaultTab,
  baseUrl,
  pillars,
  topics,
  schemaTypes,
}: Props) {
  return (
    <AdminSection
      title="API Tokens"
      description="Personal access tokens for the REST API. Tokens are shown once at creation — store them somewhere safe."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "my-tokens",
          label: "My Tokens",
          icon: <KeyRound className="size-4" />,
          content: <MyTokensTab initial={tokens} defaultTtlDays={settings.defaultTtlDays} />,
        },
        {
          value: "build-request",
          label: "Build a request",
          icon: <Wand2 className="size-4" />,
          content: (
            <BuildRequestTab
              tokens={tokens}
              baseUrl={baseUrl}
              pillars={pillars}
              topics={topics}
              schemaTypes={schemaTypes}
            />
          ),
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
