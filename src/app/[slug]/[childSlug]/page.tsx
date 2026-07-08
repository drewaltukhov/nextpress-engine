/**
 * Public route for spike posts: /<pillarSlug>/<childSlug>.
 *
 * The two-segment shape is reserved for the Posts plugin's pillar/spike
 * taxonomy. The service layer's slug uniqueness is scoped per-pillar
 * (partial unique index on `(tenant, parent_id, slug)`), so different
 * pillars can have spikes with the same slug — `/recipes/sourdough` and
 * `/photography/sourdough` are valid distinct URLs.
 *
 * 404 rules:
 *   - Pillar slug doesn't match a published, non-trashed pillar
 *   - Spike slug doesn't match a published, non-trashed spike under
 *     that pillar
 *
 * Mirrors the structure of `/[slug]/page.tsx` (setup gate, maintenance
 * gate, metadata, render). Featured image doubles as the og:image
 * fallback.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveDefaultOgImage } from "@core-plugins/seo/og-image";
import { resolveSiteUrl } from "@core/site-url";
import { getPublishedSpikeBySlug, type PostDetail } from "@core-plugins/posts";
import {
  renderPublishedPost,
  buildPostRenderInputs,
  renderPostBodyContent,
  PostJsonLd,
} from "@core-plugins/posts/published-view";
import { effectiveTemplateId, getActiveThemeSlug, renderActiveTheme } from "@core-plugins/themes";
import { renderTitleFormat } from "@core-plugins/seo/metadata";
import { listTopics, type TopicListItem } from "@core-plugins/topics";
import { normalizeSlug } from "@core/slugs/normalize";
import { DisableRightClick } from "@core/components/DisableRightClick";
import { ImageLightboxMounter } from "@core-plugins/pages/blocks/ImageLightboxMounter";

// Public pages cache rendered HTML; proxy handles setup/IP/maintenance gates.
export const revalidate = 60;

interface RouteParams {
  // First segment shares the name `slug` with the single-segment route at
  // depth 1 — Next.js routing requires consistent segment names across
  // sibling dynamic routes. Conceptually it's the pillar slug here.
  params: Promise<{ slug: string; childSlug: string }>;
  /** `?page=N` for paginated PostsGrid widgets dropped into the
   *  template body or sidebar. Absent → page 1. */
  searchParams: Promise<{ page?: string }>;
}

/** Parse `?page=` query param into a 1-based page number, defaulting
 *  to 1 when missing or unparseable. */
function readPostsPage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

interface PublicSeo {
  siteTitle: string;
  siteTagline: string;
  siteUrl: string;
  titleFormat: string;
  defaultDescription: string;
  defaultOgImage: string;
  ogSiteName: string;
  twitterHandle: string;
  language: string;
  discourageIndexing: boolean;
}

async function loadPublicSeo(): Promise<PublicSeo> {
  const [
    siteTitle,
    siteTagline,
    siteUrl,
    titleFormat,
    defaultDescription,
    defaultOgImage,
    ogSiteName,
    twitterHandle,
    language,
    discourageIndexing,
  ] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
    getSetting<string>(db(), "seo.title_format"),
    getSetting<string>(db(), "seo.default_description"),
    resolveDefaultOgImage(db()),
    getSetting<string>(db(), "seo.og_site_name"),
    getSetting<string>(db(), "seo.twitter_handle"),
    getSetting<string>(db(), "seo.language"),
    getSetting<boolean>(db(), "seo.discourage_indexing"),
  ]);
  return {
    siteTitle: siteTitle ?? "NextPress",
    siteTagline: siteTagline ?? "",
    siteUrl: siteUrl ?? "",
    titleFormat: titleFormat ?? "%title% | %site%",
    defaultDescription: defaultDescription ?? "",
    defaultOgImage: defaultOgImage ?? "",
    ogSiteName: ogSiteName ?? "",
    twitterHandle: twitterHandle ?? "",
    language: language ?? "en",
    discourageIndexing: discourageIndexing ?? false,
  };
}

function pageRobots(value: string, siteDiscouraged: boolean): Metadata["robots"] {
  if (siteDiscouraged) return { index: false, follow: false, nocache: true };
  switch (value) {
    case "noindex,follow":
      return { index: false, follow: true };
    case "index,nofollow":
      return { index: true, follow: false };
    case "noindex,nofollow":
      return { index: false, follow: false };
    case "index,follow":
    default:
      return undefined;
  }
}

async function resolveSpike(pillarSlug: string, childSlug: string): Promise<PostDetail | null> {
  const np = normalizeSlug(decodeURIComponent(pillarSlug));
  const nc = normalizeSlug(decodeURIComponent(childSlug));
  if (!np || !nc) return null;
  return getPublishedSpikeBySlug(db(), np, nc);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug: pillarSlug, childSlug } = await params;
  const post = await resolveSpike(pillarSlug, childSlug);
  if (!post) return {};
  const seo = await loadPublicSeo();

  const baseTitle = post.seoTitle?.trim() || post.title;
  const title = renderTitleFormat(seo.titleFormat, {
    pageTitle: baseTitle,
    siteTitle: seo.siteTitle,
    siteTagline: seo.siteTagline,
  });
  const description =
    post.seoDescription?.trim() ||
    post.excerpt?.trim() ||
    seo.defaultDescription ||
    undefined;
  const ogImage =
    post.seoOgImage?.trim() || post.featuredImage?.trim() || seo.defaultOgImage || "";
  const ogSiteName = seo.ogSiteName || seo.siteTitle;
  const twitterHandle = seo.twitterHandle.startsWith("@")
    ? seo.twitterHandle
    : seo.twitterHandle
      ? `@${seo.twitterHandle}`
      : undefined;

  let metadataBase: URL | undefined;
  if (seo.siteUrl) {
    try {
      metadataBase = new URL(seo.siteUrl);
    } catch {
      metadataBase = undefined;
    }
  }

  const path = `/${post.parentSlug ?? pillarSlug}/${post.slug}`;
  const canonical =
    post.seoCanonical?.trim() ||
    (seo.siteUrl ? `${seo.siteUrl.replace(/\/$/, "")}${path}` : undefined);

  return {
    metadataBase,
    title: { absolute: title },
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: pageRobots(post.seoRobots, seo.discourageIndexing),
    openGraph: {
      title,
      description,
      type: "article",
      siteName: ogSiteName,
      locale: seo.language,
      url: canonical,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      site: twitterHandle,
      creator: twitterHandle,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function PublicSpikePage({ params, searchParams }: RouteParams) {
  // Setup-cookie, IP block, and maintenance gates run in proxy.
  const { slug: pillarSlug, childSlug } = await params;
  const { page: rawPage } = await searchParams;
  const postsPage = readPostsPage(rawPage);
  const post = await resolveSpike(pillarSlug, childSlug);
  if (!post) notFound();

  const seo = await loadPublicSeo();
  const disableRightClick =
    (await getSetting<boolean>(db(), "content.disable_right_click")) ?? false;

  const path = `/${post.parentSlug ?? pillarSlug}/${post.slug}`;
  const canonical =
    post.seoCanonical?.trim() ||
    (seo.siteUrl ? `${seo.siteUrl.replace(/\/$/, "")}${path}` : path);

  const inputs = await buildPostRenderInputs(post);

  let postTopics: TopicListItem[] = [];
  if (post.topicIds.length > 0) {
    const all = await listTopics(db());
    const set = new Set(post.topicIds);
    postTopics = all.filter((t) => set.has(t.id));
  }

  const [breadcrumbEnabled, articleEnabled] = await Promise.all([
    getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    getSetting<boolean>(db(), "seo.schema_article_enabled"),
  ]);

  const seoBundle = {
    siteTitle: seo.siteTitle,
    siteUrl: seo.siteUrl,
    defaultOgImage: seo.defaultOgImage,
    discourageIndexing: seo.discourageIndexing,
  };

  // Spikes are always single-post under the hood — their template (if
  // any) must clone single-post. Pillar customs on a spike fall back to
  // the built-in.
  const activeThemeSlug = await getActiveThemeSlug(db());
  const postTemplateId = await effectiveTemplateId(
    db(),
    activeThemeSlug,
    post.template,
    "single-post",
    "single-post",
  );

  const themed = await renderActiveTheme({
    templateId: postTemplateId,
    post,
    postBody: renderPostBodyContent(inputs),
    postTopics,
    postsPage,
    routePath: path,
  });
  if (themed) {
    return (
      <>
        {themed.head}
        {themed.body}
        <PostJsonLd
          post={post}
          seo={seoBundle}
          canonical={canonical}
          data={inputs.data}
          breadcrumbEnabled={breadcrumbEnabled ?? true}
          articleEnabled={articleEnabled ?? true}
        />
        {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
      </>
    );
  }

  const body = await renderPublishedPost({
    post,
    seo: seoBundle,
    canonical,
  });

  return (
    <>
      {body}
      {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
    </>
  );
}
