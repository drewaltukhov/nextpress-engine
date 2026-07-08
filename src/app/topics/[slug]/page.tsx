/**
 * Public Topic Archive route. Resolves `/topics/<slug>` to a Topic and
 * renders the active theme's `topic-archive` template. When no theme
 * is active we render a minimal fallback list — the legacy site never
 * had a topic archive, so this is the only path.
 *
 * Phase 7 of the themes-and-menus plan.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { normalizeSlug } from "@core/slugs/normalize";
import { DisableRightClick } from "@core/components/DisableRightClick";
import { ImageLightboxMounter } from "@core-plugins/pages/blocks/ImageLightboxMounter";
import { getTopicBySlug } from "@core-plugins/topics";
import { listPosts } from "@core-plugins/posts";
import { renderActiveTheme } from "@core-plugins/themes";
import { breadcrumbJsonLd, renderTitleFormat, wrapJsonLdGraph } from "@core-plugins/seo/metadata";
import { resolveDefaultOgImage } from "@core-plugins/seo/og-image";
import { resolveSiteUrl } from "@core/site-url";
import { UnthemedShell } from "@core/components/UnthemedShell";

// Public pages cache rendered HTML; proxy handles setup/IP/maintenance gates.
export const revalidate = 60;

interface RouteParams {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function readPostsPage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const normalized = normalizeSlug(decodeURIComponent(slug));
  if (!normalized) return {};
  const topic = await getTopicBySlug(db(), normalized);
  if (!topic) return {};
  const [siteTitle, siteTagline, siteUrl, titleFormat, language, defaultOgImage] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
    getSetting<string>(db(), "seo.title_format"),
    getSetting<string>(db(), "seo.language"),
    resolveDefaultOgImage(db()),
  ]);
  const title = renderTitleFormat(titleFormat ?? "%title% | %site%", {
    pageTitle: topic.name,
    siteTitle: siteTitle ?? "NextPress",
    siteTagline: siteTagline ?? "",
  });
  const canonical = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/topics/${topic.slug}`
    : `/topics/${topic.slug}`;
  // metadataBase resolves relative og:image/twitter:image paths into
  // absolute URLs that crawlers can fetch. Without this, Next.js
  // emits a hardcoded `http://localhost:3000` prefix even on prod.
  let metadataBase: URL | undefined;
  if (siteUrl) {
    try {
      metadataBase = new URL(siteUrl);
    } catch {
      metadataBase = undefined;
    }
  }
  return {
    metadataBase,
    title: { absolute: title },
    description: topic.description ?? undefined,
    alternates: { canonical },
    openGraph: {
      title,
      description: topic.description ?? undefined,
      type: "website",
      siteName: siteTitle ?? "NextPress",
      locale: language ?? "en",
      url: canonical,
      // Falls back to the site-wide default OG image (set on the SEO
      // admin tab or the theme settings page). Topics rarely have
      // their own image; without this they shared nothing on social.
      images: defaultOgImage ? [{ url: defaultOgImage }] : undefined,
    },
    twitter: {
      card: defaultOgImage ? "summary_large_image" : "summary",
      title,
      description: topic.description ?? undefined,
      images: defaultOgImage ? [defaultOgImage] : undefined,
    },
  };
}

export default async function TopicArchivePage({ params, searchParams }: RouteParams) {
  // Setup-cookie, IP block, and maintenance gates run in proxy.
  const { slug } = await params;
  const { page: rawPage } = await searchParams;
  const postsPage = readPostsPage(rawPage);
  const normalized = normalizeSlug(decodeURIComponent(slug));
  if (!normalized) notFound();
  const topic = await getTopicBySlug(db(), normalized);
  if (!topic) notFound();

  const [disableRightClickRaw, siteUrl] = await Promise.all([
    getSetting<boolean>(db(), "content.disable_right_click"),
    resolveSiteUrl(db()),
  ]);
  const disableRightClick = disableRightClickRaw ?? false;
  const trimmedSiteUrl = (siteUrl ?? "").replace(/\/$/, "");

  // CollectionPage + BreadcrumbList. Only emit when we have a site URL
  // (skips the localhost-defaulted dev case where the URL would be empty).
  const jsonLd =
    trimmedSiteUrl &&
    JSON.stringify(
      wrapJsonLdGraph([
        {
          "@type": "CollectionPage",
          "@id": `${trimmedSiteUrl}/topics/${topic.slug}`,
          name: topic.name,
          url: `${trimmedSiteUrl}/topics/${topic.slug}`,
          ...(topic.description ? { description: topic.description } : {}),
        },
        breadcrumbJsonLd([
          { name: "Home", url: trimmedSiteUrl },
          { name: topic.name, url: `${trimmedSiteUrl}/topics/${topic.slug}` },
        ]),
      ]),
    );

  // Topic can opt into a custom Topic Archive template (clone of the
  // built-in). When set, render with the custom slug; resolveTemplateData
  // inside renderActiveTheme falls back to the built-in row if the
  // custom is missing (theme switched, custom deleted, etc.).
  const themed = await renderActiveTheme({
    templateId: topic.template ?? "topic-archive",
    topic,
    postsPage,
    routePath: `/topics/${topic.slug}`,
  });
  if (themed) {
    return (
      <>
        {themed.head}
        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
          />
        ) : null}
        {themed.body}
        {disableRightClick && <DisableRightClick />}
      <ImageLightboxMounter />
      </>
    );
  }

  // Minimal fallback — no active theme. List published posts in this topic.
  const posts = await listPosts(db(), { status: "published", topicIds: [topic.id], sort: "published_at" });
  const meta = posts.length > 0
    ? `${posts.length} ${posts.length === 1 ? "post" : "posts"}`
    : "No posts yet";
  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      <UnthemedShell title={topic.name} meta={meta}>
        {topic.description ? <p>{topic.description}</p> : null}
        {posts.length > 0 ? (
          <ul>
            {posts.map((p) => {
              const url = p.postKind === "spike" && p.parentSlug ? `/${p.parentSlug}/${p.slug}` : `/${p.slug}`;
              return (
                <li key={p.id}>
                  <a href={url}>{p.title}</a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </UnthemedShell>
      {disableRightClick && <DisableRightClick />}
      <ImageLightboxMounter />
    </>
  );
}
