import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveDefaultOgImage } from "@core-plugins/seo/og-image";
import { resolveSiteUrl } from "@core/site-url";
import { getPublishedPageBySlug, type PageDetail } from "@core-plugins/pages";
import {
  renderPublishedPage,
  buildPageRenderInputs,
  renderPageBodyContent,
  PageJsonLd,
} from "@core-plugins/pages/published-view";
import { getPublishedRootPostBySlug, type PostDetail } from "@core-plugins/posts";
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
  params: Promise<{ slug: string }>;
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

type Resolved =
  | { kind: "page"; page: PageDetail }
  | { kind: "post"; post: PostDetail };

/**
 * Resolve `/<slug>` to either a published Page or a published Post (pillar
 * or standalone). Pages take precedence — they reserve the slug at the
 * global registry level and existed first, so any slug already pointing
 * at a page keeps doing that. Posts only resolve when no live page owns
 * the slug.
 */
async function resolveContent(slug: string): Promise<Resolved | null> {
  const normalized = normalizeSlug(decodeURIComponent(slug));
  if (!normalized) return null;
  const page = await getPublishedPageBySlug(db(), normalized);
  if (page) return { kind: "page", page };
  const post = await getPublishedRootPostBySlug(db(), normalized);
  if (post) return { kind: "post", post };
  return null;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveContent(slug);
  if (!resolved) return {};
  const seo = await loadPublicSeo();

  // Same metadata shape for pages and posts. Featured image is a Posts-
  // only field; falls in line as the og:image when no explicit override
  // exists. Spikes don't surface here — they live one segment deeper.
  const item =
    resolved.kind === "page"
      ? {
          title: resolved.page.title,
          slug: resolved.page.slug,
          excerpt: resolved.page.excerpt,
          seoTitle: resolved.page.seoTitle,
          seoDescription: resolved.page.seoDescription,
          seoOgImage: resolved.page.seoOgImage,
          seoCanonical: resolved.page.seoCanonical,
          seoRobots: resolved.page.seoRobots,
          featuredImage: null as string | null,
        }
      : {
          title: resolved.post.title,
          slug: resolved.post.slug,
          excerpt: resolved.post.excerpt,
          seoTitle: resolved.post.seoTitle,
          seoDescription: resolved.post.seoDescription,
          seoOgImage: resolved.post.seoOgImage,
          seoCanonical: resolved.post.seoCanonical,
          seoRobots: resolved.post.seoRobots,
          featuredImage: resolved.post.featuredImage,
        };

  const baseTitle = item.seoTitle?.trim() || item.title;
  const title = renderTitleFormat(seo.titleFormat, {
    pageTitle: baseTitle,
    siteTitle: seo.siteTitle,
    siteTagline: seo.siteTagline,
  });
  const description =
    item.seoDescription?.trim() ||
    item.excerpt?.trim() ||
    seo.defaultDescription ||
    undefined;
  const ogImage =
    item.seoOgImage?.trim() || item.featuredImage?.trim() || seo.defaultOgImage || "";
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

  const canonical = item.seoCanonical?.trim() || (seo.siteUrl ? `${seo.siteUrl.replace(/\/$/, "")}/${item.slug}` : undefined);

  return {
    metadataBase,
    // `absolute` opts out of the root layout's `title.template`
    // ("NextPress - %s"), since `seo.title_format` already produces the
    // full title the site owner wants.
    title: { absolute: title },
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: pageRobots(item.seoRobots, seo.discourageIndexing),
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

export default async function PublicSlugPage({ params, searchParams }: RouteParams) {
  // Setup-cookie, IP block, and maintenance gates run in proxy.
  const { slug } = await params;
  const { page: rawPage } = await searchParams;
  const postsPage = readPostsPage(rawPage);
  const resolved = await resolveContent(slug);
  if (!resolved) notFound();

  const seo = await loadPublicSeo();
  const disableRightClick =
    (await getSetting<boolean>(db(), "content.disable_right_click")) ?? false;

  const seoBundle = {
    siteTitle: seo.siteTitle,
    siteUrl: seo.siteUrl,
    defaultOgImage: seo.defaultOgImage,
    discourageIndexing: seo.discourageIndexing,
  };

  // JSON-LD breadcrumb + article toggles — needed by both themed and
  // fallback paths so the public render and the admin Schema Checkup
  // tab stay in sync.
  const [breadcrumbEnabled, articleEnabled] = await Promise.all([
    getSetting<boolean>(db(), "seo.schema_breadcrumb_enabled"),
    getSetting<boolean>(db(), "seo.schema_article_enabled"),
  ]);

  if (resolved.kind === "page") {
    const canonical =
      resolved.page.seoCanonical?.trim() ||
      (seo.siteUrl
        ? `${seo.siteUrl.replace(/\/$/, "")}/${resolved.page.slug}`
        : `/${resolved.page.slug}`);

    const inputs = await buildPageRenderInputs(resolved.page);
    // Resolve a custom-vs-built-in template choice. The helper checks
    // that the saved template (if any) actually clones the expected
    // parent — guards against stale data after theme switches or
    // direct-DB edits.
    const activeThemeSlug = await getActiveThemeSlug(db());
    const pageTemplateId = await effectiveTemplateId(
      db(),
      activeThemeSlug,
      resolved.page.template,
      "single-page",
      "single-page",
    );
    const themed = await renderActiveTheme({
      templateId: pageTemplateId,
      page: resolved.page,
      pageBody: renderPageBodyContent(inputs),
      postsPage,
      routePath: `/${resolved.page.slug}`,
    });
    if (themed) {
      return (
        <>
          {themed.head}
          {themed.body}
          <PageJsonLd
            page={resolved.page}
            seo={seoBundle}
            canonical={canonical}
            data={inputs.data}
            breadcrumbEnabled={breadcrumbEnabled ?? true}
          />
          {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
        </>
      );
    }

    const body = await renderPublishedPage({ page: resolved.page, seo: seoBundle, canonical });
    return (
      <>
        {body}
        {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
      </>
    );
  }

  const canonical =
    resolved.post.seoCanonical?.trim() ||
    (seo.siteUrl
      ? `${seo.siteUrl.replace(/\/$/, "")}/${resolved.post.slug}`
      : `/${resolved.post.slug}`);

  const inputs = await buildPostRenderInputs(resolved.post);

  // Resolve topic objects for PostMeta chips. `topicIds` already lives on
  // `PostDetail`; one listTopics() round trip then filter — cheaper than
  // N getTopic-per-id calls for the typical 1–4 topics per post.
  let postTopics: TopicListItem[] = [];
  if (resolved.post.topicIds.length > 0) {
    const all = await listTopics(db());
    const set = new Set(resolved.post.topicIds);
    postTopics = all.filter((t) => set.has(t.id));
  }

  // Pillar kind takes priority — if the saved template's parent doesn't
  // match the post's kind, fall back to the built-in for the kind. This
  // is the safety net behind the admin form's kind-aware filtering.
  const expectedPostParent =
    resolved.post.postKind === "pillar" ? "single-pillar" : "single-post";
  const activeThemeSlug = await getActiveThemeSlug(db());
  const postTemplateId = await effectiveTemplateId(
    db(),
    activeThemeSlug,
    resolved.post.template,
    expectedPostParent,
    expectedPostParent,
  );

  const themed = await renderActiveTheme({
    templateId: postTemplateId,
    post: resolved.post,
    postBody: renderPostBodyContent(inputs),
    postTopics,
    postsPage,
    routePath: `/${resolved.post.slug}`,
  });
  if (themed) {
    return (
      <>
        {themed.head}
        {themed.body}
        <PostJsonLd
          post={resolved.post}
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

  const body = await renderPublishedPost({ post: resolved.post, seo: seoBundle, canonical });
  return (
    <>
      {body}
      {disableRightClick && <DisableRightClick />}
        <ImageLightboxMounter />
    </>
  );
}
