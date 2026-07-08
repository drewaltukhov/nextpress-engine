"use client";

import { Settings, Map, Bot, ShieldCheck, Building2, Boxes } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { GeneralTab } from "./GeneralTab";
import { SitemapTab } from "./SitemapTab";
import { RobotsTab } from "./RobotsTab";
import { VerificationTab } from "./VerificationTab";
import { IdentityTab } from "./IdentityTab";
import { InstallSchemasTab } from "./InstallSchemasTab";
import type { SeoSettingsBundle } from "./actions";

interface Props {
  settings: SeoSettingsBundle;
  defaultTab?: string;
}

export function SeoPageClient({ settings, defaultTab }: Props) {
  return (
    <AdminSection
      title="SEO"
      description="Search-engine metadata, sitemap, robots.txt, verification tokens, and the structured data that identifies your site to crawlers."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "general",
          label: "General",
          icon: <Settings className="size-4" />,
          content: <GeneralTab initial={settings.general} />,
        },
        {
          value: "sitemap",
          label: "Sitemap",
          icon: <Map className="size-4" />,
          content: <SitemapTab initial={settings.sitemap} sitemapUrl={settings.sitemapUrl} />,
        },
        {
          value: "robots",
          label: "Robots",
          icon: <Bot className="size-4" />,
          content: (
            <RobotsTab
              initial={settings.robots}
              siteUrl={settings.siteUrl}
              isStaging={settings.isStaging}
            />
          ),
        },
        {
          value: "verification",
          label: "Verification",
          icon: <ShieldCheck className="size-4" />,
          content: <VerificationTab initial={settings.verification} />,
        },
        {
          value: "identity",
          label: "Identity",
          icon: <Building2 className="size-4" />,
          content: <IdentityTab initial={settings.identity} />,
        },
        {
          value: "schemas",
          label: "Install schemas",
          icon: <Boxes className="size-4" />,
          content: <InstallSchemasTab initial={settings.enabledSchemas} />,
        },
      ]}
    />
  );
}
