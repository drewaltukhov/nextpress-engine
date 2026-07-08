"use client";

import { Globe, Mail, KeyRound, Wrench, FileText } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { WebsiteSettingsForm } from "./WebsiteSettingsForm";
import { SmtpSettingsForm } from "./SmtpSettingsForm";
import { ApiSettingsForm } from "./ApiSettingsForm";
import { MaintenanceSettingsForm } from "./MaintenanceSettingsForm";
import { ContentSettingsForm } from "./ContentSettingsForm";
import type { WebsiteSettings } from "./website-actions";
import type { SmtpSettings } from "./smtp-actions";
import type { ApiSettings } from "./api-actions";
import type { MaintenanceSettings } from "./maintenance-actions";
import type {
  ContentSettings,
  HomepagePageOption,
  HomepageTopicOption,
  HomepagePillarOption,
} from "./content-actions";

interface Props {
  website: WebsiteSettings;
  smtp: SmtpSettings;
  api: ApiSettings;
  maintenance: MaintenanceSettings;
  content: ContentSettings;
  homepagePages: HomepagePageOption[];
  homepageTopics: HomepageTopicOption[];
  homepagePillars: HomepagePillarOption[];
  defaultTab?: string;
}

export function SettingsPageClient({
  website,
  smtp,
  api,
  maintenance,
  content,
  homepagePages,
  homepageTopics,
  homepagePillars,
  defaultTab,
}: Props) {
  return (
    <AdminSection
      title="Settings"
      description="Site-wide configuration. Security and Logs have moved to their own pages."
      defaultTab={defaultTab}
      tabs={[
        {
          value: "website",
          label: "Website",
          icon: <Globe className="size-4" />,
          content: <WebsiteSettingsForm initial={website} />,
        },
        {
          value: "content",
          label: "Content",
          icon: <FileText className="size-4" />,
          content: (
            <ContentSettingsForm
              initial={content}
              pageOptions={homepagePages}
              topicOptions={homepageTopics}
              pillarOptions={homepagePillars}
            />
          ),
        },
        {
          value: "smtp",
          label: "SMTP",
          icon: <Mail className="size-4" />,
          content: <SmtpSettingsForm initial={smtp} />,
        },
        {
          value: "api",
          label: "API",
          icon: <KeyRound className="size-4" />,
          content: <ApiSettingsForm initial={api} />,
        },
        {
          value: "maintenance",
          label: "Maintenance",
          icon: <Wrench className="size-4" />,
          content: <MaintenanceSettingsForm initial={maintenance} />,
        },
      ]}
    />
  );
}
