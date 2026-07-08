/**
 * Public author profile route. Resolves `/author/<username>` to a User
 * by slugifying their `displayName` and matching in-memory, then
 * renders the active theme's `author` template. 404 when no user has
 * a display name slugifying to the requested handle.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveSiteUrl } from "@core/site-url";
import { DisableRightClick } from "@core/components/DisableRightClick";
import { ImageLightboxMounter } from "@core-plugins/pages/blocks/ImageLightboxMounter";
import { getAuthorByUsername, authorProfileSameAs, type AuthorProfile } from "@core-plugins/users";
import { renderActiveTheme } from "@core-plugins/themes";
import {
  breadcrumbJsonLd,
  personJsonLd,
  profilePageJsonLd,
  renderTitleFormat,
  wrapJsonLdGraph,
} from "@core-plugins/seo/metadata";

// Public pages cache rendered HTML; proxy handles setup/IP/maintenance gates.
export const revalidate = 60;

interface RouteParams {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}

function readPostsPage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { username } = await params;
  const author = await getAuthorByUsername(decodeURIComponent(username));
  if (!author) return {};
  const [siteTitle, siteTagline, siteUrl, titleFormat, language] = await Promise.all([
    getSetting<string>(db(), "site.title"),
    getSetting<string>(db(), "site.tagline"),
    resolveSiteUrl(db()),
    getSetting<string>(db(), "seo.title_format"),
    getSetting<string>(db(), "seo.language"),
  ]);
  const siteName = siteTitle ?? "NextPress";
  const title = renderTitleFormat(titleFormat ?? "%title% | %site%", {
    pageTitle: author.displayName,
    siteTitle: siteName,
    siteTagline: siteTagline ?? "",
  });
  const canonical = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/author/${author.username}`
    : `/author/${author.username}`;
  const description = author.bio?.slice(0, 200) ?? undefined;
  // metadataBase resolves relative og:image paths into absolute URLs;
  // without it Next.js emits a hardcoded `http://localhost:3000`
  // prefix even on prod.
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
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "profile",
      siteName,
      url: canonical,
      locale: language ?? undefined,
      images: author.avatarUrl ? [author.avatarUrl] : undefined,
    },
  };
}

export default async function AuthorProfilePage({ params, searchParams }: RouteParams) {
  // Setup-cookie, IP block, and maintenance gates run in proxy.
  const { username } = await params;
  const { page: rawPage } = await searchParams;
  const postsPage = readPostsPage(rawPage);
  const author = await getAuthorByUsername(decodeURIComponent(username));
  if (!author) notFound();

  const [disableRightClick, siteUrl] = await Promise.all([
    getSetting<boolean>(db(), "content.disable_right_click"),
    resolveSiteUrl(db()),
  ]);

  const themed = await renderActiveTheme({
    templateId: "author",
    author,
    postsPage,
    routePath: `/author/${author.username}`,
  });
  if (themed) {
    return (
      <>
        {themed.head}
        {themed.body}
        <AuthorJsonLd author={author} siteUrl={siteUrl ?? ""} />
        {disableRightClick ? <DisableRightClick /> : null}
        <ImageLightboxMounter />
      </>
    );
  }

  // Minimal fallback — no active theme.
  return (
    <main className="min-h-screen bg-white">
      <article className="mx-auto max-w-3xl px-6 py-10 prose prose-slate">
        <h1>{author.displayName}</h1>
        {author.fullName ? <p className="text-slate-500">{author.fullName}</p> : null}
        {author.bio ? <p className="whitespace-pre-line">{author.bio}</p> : null}
      </article>
      <AuthorJsonLd author={author} siteUrl={siteUrl ?? ""} />
      {disableRightClick ? <DisableRightClick /> : null}
        <ImageLightboxMounter />
    </main>
  );
}

function AuthorJsonLd({ author, siteUrl }: { author: AuthorProfile; siteUrl: string }) {
  const base = siteUrl ? siteUrl.replace(/\/$/, "") : "";
  const url = `${base}/author/${author.username}`;
  const description = author.bio?.trim() || undefined;
  // Prefer `fullName` for `name` so structured data carries the
  // person's real name; fall back to displayName when only the handle
  // is set. The other one becomes alternateName so search engines see
  // both.
  const realName = author.fullName?.trim();
  const handle = author.displayName.trim();
  const primary = realName || handle;
  const alternate = realName && handle && realName !== handle ? handle : undefined;

  const person = personJsonLd({
    url,
    name: primary,
    alternateName: alternate,
    description,
    image: author.avatarUrl ?? undefined,
    sameAs: authorProfileSameAs(author),
    siteUrl,
  });
  const profilePage = profilePageJsonLd({
    url,
    name: primary,
    personId: url,
    description,
  });
  // Home → <author name>. Only emit when we have a site URL (skips the
  // localhost-defaulted dev case where the URL field would be empty).
  const nodes: object[] = [profilePage, person];
  if (base) {
    nodes.push(
      breadcrumbJsonLd([
        { name: "Home", url: base },
        { name: primary, url },
      ]),
    );
  }
  return (
    <script
      type="application/ld+json"
      // JSON serialised server-side; safe to inject as innerHTML.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(wrapJsonLdGraph(nodes)),
      }}
    />
  );
}
