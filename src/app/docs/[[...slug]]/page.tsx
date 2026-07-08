import { source } from "@/app/source";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { db } from "@core/db/instance";
import { resolveSiteUrl } from "@core/site-url";
import { breadcrumbJsonLd, wrapJsonLdGraph } from "@core-plugins/seo/metadata";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  // Breadcrumb trail: Home → Docs → … → <self>. Mirrors the post /
  // page renderers so docs participate in the same rich-result chain
  // search engines see across the site. Built server-side so the
  // structured data ships in the initial HTML response.
  const siteUrl = (await resolveSiteUrl(db())).replace(/\/$/, "");
  const trail: Array<{ name: string; url: string }> = [];
  if (siteUrl) {
    trail.push({ name: "Home", url: siteUrl });
    trail.push({ name: "Docs", url: `${siteUrl}/docs` });
    const slugSegments = params.slug ?? [];
    // Walk the saved slug parts and try to resolve a human title for
    // each intermediate node from the Fumadocs source. Falling back to
    // the slug fragment keeps the chain valid when an intermediate
    // page doesn't exist (eg. category folders with no own MDX).
    for (let i = 0; i < slugSegments.length; i++) {
      const sub = slugSegments.slice(0, i + 1);
      const node = source.getPage(sub);
      trail.push({
        name: node?.data.title ?? sub[sub.length - 1],
        url: `${siteUrl}/docs/${sub.join("/")}`,
      });
    }
  }
  const jsonLdNodes = trail.length >= 2 ? [breadcrumbJsonLd(trail)] : [];

  return (
    <>
      {jsonLdNodes.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(wrapJsonLdGraph(jsonLdNodes)) }}
        />
      )}
      <DocsPage toc={page.data.toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  // Canonical URL — docs pages were inheriting the root layout
  // canonical (the site root) which makes every docs page look like
  // a duplicate to crawlers. Build the canonical from the resolved
  // slug; an empty slug means /docs itself.
  let canonical: string | undefined;
  try {
    const siteUrl = (await resolveSiteUrl(db())).replace(/\/$/, "");
    const slugPath = (params.slug ?? []).join("/");
    canonical = slugPath ? `${siteUrl}/docs/${slugPath}` : `${siteUrl}/docs`;
  } catch {
    // DB unavailable during build — drop canonical silently rather
    // than crash the prerender of every docs page.
  }

  return {
    title: page.data.title,
    description: page.data.description,
    ...(canonical ? { alternates: { canonical } } : {}),
  };
}
