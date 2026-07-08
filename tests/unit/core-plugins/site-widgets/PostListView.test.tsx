import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PostListView, type PostListOptions } from "../../../../src/core-plugins/site-widgets/PostListView";

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

function baseOptions(overrides: Partial<PostListOptions> = {}): PostListOptions {
  return {
    posts: [POST],
    layout: "list",
    limit: 5,
    showThumbnail: false,
    showTopic: false,
    gridColumns: 2,
    gridAspect: "rectangle",
    pagination: null,
    display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    ...overrides,
  };
}

describe("PostListView — layouts", () => {
  it("grid layout uses grid wrapper with sm:grid-cols-2 by default", () => {
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ layout: "grid" })} />);
    expect(html).toMatch(/class="[^"]*\bgrid\b[^"]*"/);
    expect(html).toMatch(/sm:grid-cols-2/);
  });

  it("grid layout with gridColumns=3 produces sm:grid-cols-3", () => {
    const html = renderToStaticMarkup(
      <PostListView {...baseOptions({ layout: "grid", gridColumns: 3 })} />,
    );
    expect(html).toMatch(/sm:grid-cols-3/);
  });

  it("grid layout with gridColumns=4 produces lg:grid-cols-4", () => {
    const html = renderToStaticMarkup(
      <PostListView {...baseOptions({ layout: "grid", gridColumns: 4 })} />,
    );
    expect(html).toMatch(/lg:grid-cols-4/);
  });

  it("grid aspect rectangle produces aspect-video", () => {
    const html = renderToStaticMarkup(
      <PostListView {...baseOptions({ layout: "grid", gridAspect: "rectangle", showThumbnail: true, posts: [{ ...POST, featuredImage: "/img.jpg" }] })} />,
    );
    expect(html).toMatch(/aspect-video/);
  });

  it("grid aspect square produces aspect-square", () => {
    const html = renderToStaticMarkup(
      <PostListView {...baseOptions({ layout: "grid", gridAspect: "square", showThumbnail: true, posts: [{ ...POST, featuredImage: "/img.jpg" }] })} />,
    );
    expect(html).toMatch(/aspect-square/);
  });

  it("plain layout renders <ul class*='divide-y'>", () => {
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ layout: "plain" })} />);
    expect(html).toMatch(/class="[^"]*divide-y[^"]*"/);
  });

  it("list layout renders <ul class*='space-y'>", () => {
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ layout: "list" })} />);
    expect(html).toMatch(/class="[^"]*space-y[^"]*"/);
  });
});

describe("PostListView — pagination", () => {
  it("renders no pagination markers when pagination is null", () => {
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ pagination: null })} />);
    expect(html).not.toMatch(/\?page=2/);
  });

  it("renders pagination links when pagination is non-null and totalPages > 1", () => {
    const html = renderToStaticMarkup(
      <PostListView
        {...baseOptions({
          pagination: {
            currentPage: 1,
            totalPages: 3,
            linkFor: (n) => (n <= 1 ? "/" : `/?page=${n}`),
            style: "numbered",
            type: "buttons",
            align: "center",
          },
        })}
      />,
    );
    expect(html).toMatch(/\?page=2/);
  });

  it("does not render pagination when totalPages === 1 even if pagination is non-null", () => {
    const html = renderToStaticMarkup(
      <PostListView
        {...baseOptions({
          pagination: {
            currentPage: 1,
            totalPages: 1,
            linkFor: (n) => (n <= 1 ? "/" : `/?page=${n}`),
            style: "numbered",
            type: "buttons",
            align: "center",
          },
        })}
      />,
    );
    expect(html).not.toMatch(/\?page=2/);
  });
});

describe("PostListView — empty state and limit", () => {
  it("renders 'No posts yet.' when posts is empty", () => {
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ posts: [] })} />);
    expect(html).toMatch(/No posts yet/);
  });

  it("respects `limit` by slicing input array", () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({ ...POST, id: i + 1, title: `Post ${i + 1}` }));
    const html = renderToStaticMarkup(<PostListView {...baseOptions({ posts, limit: 3 })} />);
    expect(html).toMatch(/Post 1/);
    expect(html).toMatch(/Post 3/);
    expect(html).not.toMatch(/Post 4/);
  });
});
