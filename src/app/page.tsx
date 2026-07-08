import type { Metadata } from "next";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveDefaultOgImage } from "@core-plugins/seo/og-image";
import { resolveSiteUrl } from "@core/site-url";
import {
  identityJsonLd,
  webSiteJsonLd,
  wrapJsonLdGraph,
  type IdentityData,
} from "@core-plugins/seo/metadata";
import { getPage } from "@core-plugins/pages";
import { renderPublishedPage } from "@core-plugins/pages/published-view";
import { renderActiveTheme } from "@core-plugins/themes";
import { getHomepageContentSource } from "@core-plugins/themes/homepage-source-actions";
import { buildPageRenderInputs, renderPageBodyContent } from "@core-plugins/pages/published-view";
import { DisableRightClick } from "@core/components/DisableRightClick";
import { ImageLightboxMounter } from "@core-plugins/pages/blocks/ImageLightboxMounter";

// Public pages serve cached HTML by default — proxy handles setup-cookie,
// IP block, and maintenance gate so the page itself stays free of dynamic
// APIs (`cookies()` / `headers()`).
export const revalidate = 60;

interface HomeSeoSettings {
  siteTitle: string;
  siteTagline: string;
  siteUrl: string;
  titleFormat: string;
  defaultDescription: string;
  language: string;
  defaultOgImage: string;
  ogSiteName: string;
  twitterHandle: string;
  discourageIndexing: boolean;
  identity: IdentityData;
  schemaWebsite: boolean;
}

async function loadHomeSeoSettings(): Promise<HomeSeoSettings> {
  const [
    siteTitle,
    siteTagline,
    siteUrl,
    titleFormat,
    defaultDescription,
    language,
    defaultOgImage,
    ogSiteName,
    twitterHandle,
    discourageIndexing,
    identity,
    schemaWebsite,
  ] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
    getSetting<string>(db(), "seo.title_format"),
    getSetting<string>(db(), "seo.default_description"),
    getSetting<string>(db(), "seo.language"),
    resolveDefaultOgImage(db()),
    getSetting<string>(db(), "seo.og_site_name"),
    getSetting<string>(db(), "seo.twitter_handle"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
    getSetting<IdentityData>(db(), "seo.identity_data"),
    getSetting<boolean>(db(), "seo.schema_website_enabled"),
  ]);

  return {
    siteTitle: siteTitle ?? "NextPress",
    siteTagline: siteTagline ?? "",
    siteUrl: siteUrl ?? "",
    titleFormat: titleFormat ?? "%title% | %site%",
    defaultDescription: defaultDescription ?? "",
    language: language ?? "en",
    defaultOgImage: defaultOgImage ?? "",
    ogSiteName: ogSiteName ?? "",
    twitterHandle: twitterHandle ?? "",
    discourageIndexing: discourageIndexing ?? false,
    identity:
      identity ?? {
        type: "organization",
        name: "",
        logo: "",
        description: "",
        sameAs: [],
        contactEmail: "",
        contactPhone: "",
      },
    schemaWebsite: schemaWebsite ?? true,
  };
}


export async function generateMetadata(): Promise<Metadata> {
  const s = await loadHomeSeoSettings();
  // Home title: prefer "<site> — <tagline>" when a tagline is set,
  // otherwise plain "<site>". The site-wide `%title% | %site%` format
  // would otherwise render as "<site> | <site>" because there's no
  // distinct page title at the root.
  const title = s.siteTagline?.trim()
    ? `${s.siteTitle} — ${s.siteTagline.trim()}`
    : s.siteTitle;
  const description = s.defaultDescription || s.siteTagline;
  const ogSiteName = s.ogSiteName || s.siteTitle;
  const twitterHandle = s.twitterHandle.startsWith("@")
    ? s.twitterHandle
    : s.twitterHandle
      ? `@${s.twitterHandle}`
      : undefined;

  // metadataBase lets Next resolve relative og:image/twitter:image paths
  // (e.g. /media/abc) into absolute URLs that crawlers can fetch.
  let metadataBase: URL | undefined;
  if (s.siteUrl) {
    try {
      metadataBase = new URL(s.siteUrl);
    } catch {
      metadataBase = undefined;
    }
  }

  const meta: Metadata = {
    metadataBase,
    title,
    description: description || undefined,
    openGraph: {
      title,
      description: description || undefined,
      type: "website",
      siteName: ogSiteName,
      locale: s.language,
      url: s.siteUrl || undefined,
      images: s.defaultOgImage ? [{ url: s.defaultOgImage }] : undefined,
    },
    twitter: {
      card: s.defaultOgImage ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      site: twitterHandle,
      creator: twitterHandle,
      images: s.defaultOgImage ? [s.defaultOgImage] : undefined,
    },
    robots: s.discourageIndexing
      ? { index: false, follow: false, nocache: true }
      : undefined,
    // Verification meta tags are emitted by the root layout
    // (`src/app/layout.tsx`) so every public route inherits them — no
    // need to duplicate here.
    alternates: s.siteUrl ? { canonical: s.siteUrl } : undefined,
  };
  return meta;
}

interface HomePageJsonLdProps {
  settings: HomeSeoSettings;
}

function HomePageJsonLd({ settings }: HomePageJsonLdProps) {
  if (settings.discourageIndexing) return null;

  const nodes: object[] = [];

  if (settings.schemaWebsite && settings.siteTitle) {
    nodes.push(
      webSiteJsonLd({
        name: settings.siteTitle,
        url: settings.siteUrl || "",
        description: settings.siteTagline || undefined,
      }),
    );
  }

  const identityNode = identityJsonLd(settings.identity, settings.siteUrl);
  if (identityNode) nodes.push(identityNode);

  if (nodes.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      // JSON serialized server-side; safe to inject via dangerouslySetInnerHTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(wrapJsonLdGraph(nodes)) }}
    />
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `?page=N` drives pagination for any PostsGrid widgets dropped on
  // the homepage template (sidebar Recent Posts, etc.). The homepage's
  // main content grid reads it via `homepageDisplay` separately — both
  // converge on the same query param so users get one Prev/Next set.
  const rawPostsPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const postsPageNum = (() => {
    if (!rawPostsPage) return 1;
    const n = Number.parseInt(rawPostsPage, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  // Setup-cookie gate, IP/country block, and maintenance rewrite all run
  // in the proxy (`src/proxy.ts`) — by the time we get here, the visitor
  // is past those gates. Page stays free of dynamic APIs so `revalidate`
  // and edge cache apply.
  const seo = await loadHomeSeoSettings();
  const [homepageSource, disableRightClick] = await Promise.all([
    getHomepageContentSource(),
    getSetting<boolean>(db(), "content.disable_right_click"),
  ]);

  if (homepageSource.kind === "page" && homepageSource.page) {
    const page = await getPage(db(), homepageSource.page.id);
    if (page && page.status === "published" && !page.trashedAt) {
      const canonical = seo.siteUrl ? seo.siteUrl.replace(/\/$/, "") : "/";

      // Active-theme path: render via the **homepage** template so any
      // widgets the user added in the builder's Homepage tab (Hero,
      // Banner, PostsGrid, etc.) wrap the page body. The HomepageMain
      // block (label "Page Content") in that template renders the page
      // body when `metadata.pageBody` is present, which is exactly the
      // path we hit here.
      const inputs = await buildPageRenderInputs(page);
      const themed = await renderActiveTheme({
        templateId: "homepage",
        page,
        pageBody: renderPageBodyContent(inputs),
        searchParams: params,
        postsPage: postsPageNum,
        routePath: "/",
      });
      if (themed) {
        return (
          <>
            {themed.head}
            {themed.body}
            <HomePageJsonLd settings={seo} />
            {disableRightClick && <DisableRightClick />}
          <ImageLightboxMounter />
          </>
        );
      }

      // Legacy fallback (no active theme).
      const body = await renderPublishedPage({
        page,
        seo: {
          siteTitle: seo.siteTitle,
          siteUrl: seo.siteUrl,
          defaultOgImage: seo.defaultOgImage,
          discourageIndexing: seo.discourageIndexing,
        },
        canonical,
      });
      return (
        <>
          {body}
          <HomePageJsonLd settings={seo} />
          {disableRightClick && <DisableRightClick />}
          <ImageLightboxMounter />
        </>
      );
    }
  }

  // No static homepage page configured — try the active theme's
  // Homepage template (a recent-posts grid via PostsGrid by default).
  const themedHome = await renderActiveTheme({
    templateId: "homepage",
    searchParams: params,
    postsPage: postsPageNum,
    routePath: "/",
  });
  if (themedHome) {
    return (
      <>
        {themedHome.head}
        {themedHome.body}
        <HomePageJsonLd settings={seo} />
        {disableRightClick && <DisableRightClick />}
          <ImageLightboxMounter />
      </>
    );
  }

  // Final fallback: original "configure me" hint.
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
        background: "#f8fafc",
        color: "#64748b",
      }}
    >
      <p>Choose your NextPress homepage in Admin settings.</p>
      <HomePageJsonLd settings={seo} />
      {disableRightClick && <DisableRightClick />}
          <ImageLightboxMounter />
    </main>
  );
}
