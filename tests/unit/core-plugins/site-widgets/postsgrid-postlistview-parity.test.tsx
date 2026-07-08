import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { PostsGrid } from "../../../../src/core-plugins/site-widgets/PostsGrid";

const POST = {
  id: 1,
  title: "Hello",
  slug: "hello",
  url: "/posts/hello",
  publishedAt: null as string | null,
  featuredImage: null as string | null,
  excerpt: null as string | null,
  topic: null as { id: number; name: string; slug: string } | null,
};

function renderPostsGrid(props: Record<string, unknown>): string {
  const puck = {
    isEditing: false,
    metadata: {
      postsGrid: { "": [POST] },
      display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    },
  };
  const renderFn = (PostsGrid as unknown as { render: (p: unknown) => ReactElement }).render;
  return renderToStaticMarkup(renderFn({ ...props, puck } as never));
}

describe("PostsGrid via PostListView — visual parity", () => {
  it("list layout produces space-y wrapper", () => {
    const html = renderPostsGrid({ layout: "list", limit: 5, title: "" });
    expect(html).toMatch(/class="[^"]*space-y[^"]*"/);
  });

  it("grid layout produces grid wrapper", () => {
    const html = renderPostsGrid({ layout: "grid", limit: 5, title: "", gridColumns: 2, gridAspect: "rectangle" });
    expect(html).toMatch(/class="[^"]*\bgrid\b[^"]*"/);
  });

  it("plain layout produces divide-y wrapper", () => {
    const html = renderPostsGrid({ layout: "plain", limit: 5, title: "" });
    expect(html).toMatch(/class="[^"]*divide-y[^"]*"/);
  });

  it("empty results show 'No posts yet.'", () => {
    const puck = {
      isEditing: false,
      metadata: { postsGrid: { "": [] }, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } },
    };
    const renderFn = (PostsGrid as unknown as { render: (p: unknown) => ReactElement }).render;
    const html = renderToStaticMarkup(
      renderFn({ layout: "list", limit: 5, title: "", puck } as never),
    );
    expect(html).toMatch(/No posts yet/);
  });

  it("title prop renders as h3 above the list when set", () => {
    const html = renderPostsGrid({ layout: "list", limit: 5, title: "Latest" });
    expect(html).toMatch(/<h3[^>]*>Latest<\/h3>/);
  });
});
