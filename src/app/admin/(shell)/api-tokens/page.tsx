import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@core/db/instance";
import { listPosts } from "@core-plugins/posts";
import { listTopics } from "@core-plugins/topics";
import { SCHEMA_CATALOG } from "@core-plugins/seo/schema-catalog";
import { getMyTokens, getApiTokensSettings } from "./actions";
import { ApiTokensPageClient } from "./ApiTokensPageClient";

export const metadata: Metadata = { title: "API Tokens" };

const TABS = ["my-tokens", "build-request", "settings"] as const;
type TabValue = (typeof TABS)[number];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

async function deriveBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ApiTokensPage({ searchParams }: PageProps) {
  const [tokens, settings, params, baseUrl, pillarsRaw, topicsRaw] = await Promise.all([
    getMyTokens(),
    getApiTokensSettings(),
    searchParams,
    deriveBaseUrl(),
    listPosts(db(), { kind: "pillar", status: "all" }),
    listTopics(db()),
  ]);

  const pillars = pillarsRaw.map((p) => ({ id: p.id, title: p.title }));
  const topics = topicsRaw.map((t) => ({ id: t.id, name: t.name }));
  const schemaTypes = SCHEMA_CATALOG.map((s) => ({ type: s.type, name: s.name }));

  const requested = params.tab as TabValue | undefined;
  const defaultTab: TabValue =
    requested && TABS.includes(requested) ? requested : "my-tokens";

  return (
    <ApiTokensPageClient
      tokens={tokens}
      settings={settings}
      defaultTab={defaultTab}
      baseUrl={baseUrl}
      pillars={pillars}
      topics={topics}
      schemaTypes={schemaTypes}
    />
  );
}
