"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import type { IdentityData } from "@core-plugins/seo/metadata";
import { SCHEMA_CATALOG_TYPES } from "@core-plugins/seo/schema-catalog";

export type SaveResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Types — read by tab components via `import type`
// ---------------------------------------------------------------------------

export interface GeneralSettings {
  titleFormat: string;
  defaultDescription: string;
  language: string;
  defaultOgImage: string;
  ogSiteName: string;
  twitterHandle: string;
}

export interface SitemapSettings {
  enabled: boolean;
  include: {
    homepage: boolean;
    posts: boolean;
    pages: boolean;
    topics: boolean;
    media: boolean;
  };
}

export interface RobotsSettings {
  discourageIndexing: boolean;
  discourageAiAgents: boolean;
  customContent: string;
}

export interface VerificationSettings {
  google: string;
  bing: string;
  yandex: string;
  pinterest: string;
}

export interface IdentitySettings {
  data: IdentityData;
  schemaWebsiteEnabled: boolean;
  schemaBreadcrumbEnabled: boolean;
  schemaArticleEnabled: boolean;
}

export interface SeoSettingsBundle {
  general: GeneralSettings;
  sitemap: SitemapSettings;
  robots: RobotsSettings;
  verification: VerificationSettings;
  identity: IdentitySettings;
  enabledSchemas: string[];
  /** Inputs the RobotsTab live preview feeds to generateRobotsTxt itself. */
  siteUrl: string;
  isStaging: boolean;
  sitemapUrl: string;
}

// ---------------------------------------------------------------------------
// Admin guard
// ---------------------------------------------------------------------------

async function requireAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can manage SEO settings" };
  }
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

function siteUrlFromEnv(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function isStagingEnv(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getSeoSettings(): Promise<SeoSettingsBundle> {
  const [
    titleFormat,
    defaultDescription,
    language,
    defaultOgImage,
    ogSiteName,
    twitterHandle,
    sitemapEnabled,
    sitemapInclude,
    discourageIndexing,
    discourageAiAgents,
    robotsCustom,
    verGoogle,
    verBing,
    verYandex,
    verPinterest,
    identityData,
    schemaWebsite,
    schemaBreadcrumb,
    schemaArticle,
    enabledSchemas,
    siteUrlSetting,
  ] = await Promise.all([
    getSetting<string>(db(), "seo.title_format"),
    getSetting<string>(db(), "seo.default_description"),
    getSetting<string>(db(), "seo.language"),
    getSetting<string>(db(), "seo.default_og_image"),
    getSetting<string>(db(), "seo.og_site_name"),
    getSetting<string>(db(), "seo.twitter_handle"),
    getSetting<boolean>(db(), "seo.sitemap_enabled"),
    getSetting<SitemapSettings["include"]>(db(), "seo.sitemap_include"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
    getSetting<boolean>(db(), "seo.discourage_ai_agents"),
    getSetting<string>(db(), "seo.robots_custom"),
    getSetting<string>(db(), "seo.verification_google"),
    getSetting<string>(db(), "seo.verification_bing"),
    getSetting<string>(db(), "seo.verification_yandex"),
    getSetting<string>(db(), "seo.verification_pinterest"),
    getSetting<IdentityData>(db(), "seo.identity_data"),
    getSetting<boolean>(db(), "seo.schema_website_enabled"),
    getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    getSetting<boolean>(db(), "seo.schema_article_enabled"),
    getSetting<string[]>(db(), "seo.enabled_schemas"),
    getSetting<string>(db(), "site.url"),
  ]);

  const siteUrl = (siteUrlSetting && siteUrlSetting.length > 0) ? siteUrlSetting : siteUrlFromEnv();

  return {
    general: {
      titleFormat: titleFormat ?? "%title% | %site%",
      defaultDescription: defaultDescription ?? "",
      language: language ?? "en",
      defaultOgImage: defaultOgImage ?? "",
      ogSiteName: ogSiteName ?? "",
      twitterHandle: twitterHandle ?? "",
    },
    sitemap: {
      enabled: sitemapEnabled ?? true,
      include: sitemapInclude ?? {
        homepage: true,
        posts: true,
        pages: true,
        topics: true,
        media: false,
      },
    },
    robots: {
      discourageIndexing: discourageIndexing ?? false,
      discourageAiAgents: discourageAiAgents ?? false,
      customContent: robotsCustom ?? "",
    },
    verification: {
      google: verGoogle ?? "",
      bing: verBing ?? "",
      yandex: verYandex ?? "",
      pinterest: verPinterest ?? "",
    },
    identity: {
      data:
        identityData ?? {
          type: "organization",
          name: "",
          logo: "",
          description: "",
          sameAs: [],
          contactEmail: "",
          contactPhone: "",
        },
      schemaWebsiteEnabled: schemaWebsite ?? true,
      schemaBreadcrumbEnabled: schemaBreadcrumb ?? true,
      schemaArticleEnabled: schemaArticle ?? true,
    },
    enabledSchemas: (enabledSchemas ?? []).filter((t) => SCHEMA_CATALOG_TYPES.has(t)),
    siteUrl,
    isStaging: isStagingEnv(),
    sitemapUrl: `${siteUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}

// ---------------------------------------------------------------------------
// Saves — one per tab
// ---------------------------------------------------------------------------

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const guard = await requireAdminUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  return guard;
}

async function audit(
  userId: string,
  targetId: string,
  diff: Record<string, unknown>,
): Promise<void> {
  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.changed",
      targetType: "settings",
      targetId,
      diff,
    });
  } catch {
    // Audit failures must not break the action.
  }
}

export async function saveGeneralSettings(
  input: GeneralSettings,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  const titleFormat = input.titleFormat.trim();
  if (!titleFormat) return { ok: false, error: "Title format is required" };
  if (!/%title%|%site%|%tagline%/.test(titleFormat)) {
    return {
      ok: false,
      error: "Title format must contain at least one of %title%, %site%, or %tagline%",
    };
  }

  const ogImage = input.defaultOgImage.trim();
  if (ogImage && !/^(https?:\/\/.+|\/.+)$/.test(ogImage)) {
    return {
      ok: false,
      error: "Social image must be an absolute URL or a media path (e.g. /media/...)",
    };
  }

  try {
    await Promise.all([
      setSetting(db(), "seo.title_format", titleFormat, opts),
      setSetting(db(), "seo.default_description", input.defaultDescription.trim(), opts),
      setSetting(db(), "seo.language", input.language.trim() || "en", opts),
      setSetting(db(), "seo.default_og_image", ogImage, opts),
      setSetting(db(), "seo.og_site_name", input.ogSiteName.trim(), opts),
      setSetting(db(), "seo.twitter_handle", input.twitterHandle.trim(), opts),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  await audit(guard.userId, "seo.general", { ...input });

  revalidatePath("/admin/seo");
  revalidatePath("/");
  return { ok: true };
}

export async function saveSitemapSettings(
  input: SitemapSettings,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  try {
    await Promise.all([
      setSetting(db(), "seo.sitemap_enabled", input.enabled, opts),
      setSetting(db(), "seo.sitemap_include", input.include, opts),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  await audit(guard.userId, "seo.sitemap", { ...input });

  revalidatePath("/admin/seo");
  revalidatePath("/sitemap.xml");
  return { ok: true };
}

export async function saveRobotsSettings(
  input: RobotsSettings,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  // Normalize before any write — a malformed payload must fail here, not
  // mid-sequence with settings half-applied (setSetting zod-parses each
  // value and there is no transaction across the three writes).
  const discourageIndexing = input.discourageIndexing === true;
  const discourageAiAgents = input.discourageAiAgents === true;
  const customContent =
    typeof input.customContent === "string" ? input.customContent.trim() : "";

  try {
    // Independent keys — write in parallel so the writes race the bulk-cache
    // invalidation instead of each paying a fresh guard SELECT round-trip.
    await Promise.all([
      setSetting(db(), "seo.discourage_indexing", discourageIndexing, opts),
      setSetting(db(), "seo.discourage_ai_agents", discourageAiAgents, opts),
      setSetting(db(), "seo.robots_custom", customContent, opts),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  await audit(guard.userId, "seo.robots", {
    discourageIndexing,
    discourageAiAgents,
    customContent,
  });

  revalidatePath("/admin/seo");
  // /robots.txt and /llms.txt are force-dynamic and cached at the CDN edge by
  // their Cache-Control s-maxage headers — a layer revalidatePath cannot
  // purge. Changes propagate as those entries expire (≤1 hour each).
  return { ok: true };
}

export async function saveVerificationSettings(
  input: VerificationSettings,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  try {
    await Promise.all([
      setSetting(db(), "seo.verification_google", input.google.trim(), opts),
      setSetting(db(), "seo.verification_bing", input.bing.trim(), opts),
      setSetting(db(), "seo.verification_yandex", input.yandex.trim(), opts),
      setSetting(db(), "seo.verification_pinterest", input.pinterest.trim(), opts),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  // Don't write the actual tokens into the audit diff — log presence only.
  await audit(guard.userId, "seo.verification", {
    google: Boolean(input.google),
    bing: Boolean(input.bing),
    yandex: Boolean(input.yandex),
    pinterest: Boolean(input.pinterest),
  });

  revalidatePath("/admin/seo");
  revalidatePath("/");
  return { ok: true };
}

export async function saveEnabledSchemas(input: string[]): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  // Drop unknown types and dedupe — UI shouldn't send them, but be defensive.
  const cleaned = Array.from(new Set(input.filter((t) => SCHEMA_CATALOG_TYPES.has(t))));

  try {
    await setSetting(db(), "seo.enabled_schemas", cleaned, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  await audit(guard.userId, "seo.enabled_schemas", { types: cleaned });

  revalidatePath("/admin/seo");
  return { ok: true };
}

export async function saveIdentitySettings(
  input: IdentitySettings,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const opts = { updatedBy: guard.userId };

  try {
    await Promise.all([
      setSetting(db(), "seo.identity_data", input.data, opts),
      setSetting(db(), "seo.schema_website_enabled", input.schemaWebsiteEnabled, opts),
      setSetting(db(), "seo.schema_breadcrumb_enabled", input.schemaBreadcrumbEnabled, opts),
      setSetting(db(), "seo.schema_article_enabled", input.schemaArticleEnabled, opts),
    ]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  await audit(guard.userId, "seo.identity", {
    type: input.data.type,
    schemaWebsiteEnabled: input.schemaWebsiteEnabled,
    schemaBreadcrumbEnabled: input.schemaBreadcrumbEnabled,
    schemaArticleEnabled: input.schemaArticleEnabled,
  });

  revalidatePath("/admin/seo");
  revalidatePath("/");
  return { ok: true };
}
