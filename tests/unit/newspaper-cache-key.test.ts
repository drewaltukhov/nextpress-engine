import { describe, it, expect } from "vitest";
import { newspaperCacheKey, type NewspaperScope } from "@core-plugins/site-widgets/newspaper/types";

describe("newspaperCacheKey", () => {
  it("formats a pillar scope as 'pillar:<id>'", () => {
    const scope: NewspaperScope = { type: "pillar", key: "42" };
    expect(newspaperCacheKey(scope)).toBe("pillar:42");
  });

  it("formats a topic scope as 'topic:<slug>'", () => {
    const scope: NewspaperScope = { type: "topic", key: "reviews" };
    expect(newspaperCacheKey(scope)).toBe("topic:reviews");
  });

  it("formats an all-pillar scope with sorted comma-joined keys", () => {
    const scope: NewspaperScope = {
      type: "all",
      allType: "pillar",
      scopes: [
        { type: "pillar", key: "5" },
        { type: "pillar", key: "2" },
        { type: "pillar", key: "9" },
      ],
    };
    expect(newspaperCacheKey(scope)).toBe("all:pillar:2,5,9");
  });

  it("formats an all-topic scope with sorted comma-joined slugs", () => {
    const scope: NewspaperScope = {
      type: "all",
      allType: "topic",
      scopes: [
        { type: "topic", key: "creams" },
        { type: "topic", key: "pills" },
      ],
    };
    expect(newspaperCacheKey(scope)).toBe("all:topic:creams,pills");
  });

  it("appends ':offset=N' when offset > 0", () => {
    expect(
      newspaperCacheKey({ type: "topic", key: "reviews" }, 10),
    ).toBe("topic:reviews:offset=10");
  });

  it("omits the offset suffix when offset is 0 or undefined", () => {
    const scope: NewspaperScope = { type: "topic", key: "reviews" };
    expect(newspaperCacheKey(scope, 0)).toBe("topic:reviews");
    expect(newspaperCacheKey(scope)).toBe("topic:reviews");
  });

  it("uses 'all:<allType>:*' for the empty-scopes sentinel", () => {
    // The Newspaper widgets surface an "all of that kind" sentinel
    // when the multi-picker is in its "all checked" state — `scopes`
    // is empty but the dimension is preserved via `allType`. The
    // cache key needs to be stable so SSR and mounter agree.
    expect(
      newspaperCacheKey({ type: "all", allType: "pillar", scopes: [] }),
    ).toBe("all:pillar:*");
    expect(
      newspaperCacheKey({ type: "all", allType: "topic", scopes: [] }),
    ).toBe("all:topic:*");
  });
});
