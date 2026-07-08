import { describe, it, expect } from "vitest";
import { FIELDS, RESOURCES, METHODS } from "@/app/admin/(shell)/api-tokens/buildRequest/manifest";

describe("buildRequest manifest", () => {
  it("exposes posts and topics resources", () => {
    expect(RESOURCES).toEqual(["posts", "topics"]);
  });

  it("exposes the four supported methods", () => {
    expect(METHODS).toEqual(["POST", "PATCH", "GET", "GET_BY_ID"]);
  });

  it("posts field set matches issue #60", () => {
    const names = FIELDS.posts.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        "content_json",
        "excerpt",
        "featured_image",
        "parent_id",
        "post_kind",
        "schema_types",
        "seo_canonical",
        "seo_description",
        "seo_exclude_from_sitemap",
        "seo_og_image",
        "seo_robots",
        "seo_title",
        "slug",
        "status",
        "title",
        "topic_ids",
      ].sort()
    );
  });

  it("topics field set is name/slug/description/template", () => {
    const names = FIELDS.topics.map((f) => f.name).sort();
    expect(names).toEqual(["description", "name", "slug", "template"]);
  });

  it("required fields are pre-checked", () => {
    for (const resource of RESOURCES) {
      for (const f of FIELDS[resource]) {
        if (f.required) expect(f.defaultChecked).toBe(true);
      }
    }
  });

  it("field names are unique within each resource", () => {
    for (const resource of RESOURCES) {
      const names = FIELDS[resource].map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("content_json placeholder signals stringified Puck tree", () => {
    const f = FIELDS.posts.find((x) => x.name === "content_json");
    expect(f?.placeholder).toBe("{{content_json_stringified_puck_tree}}");
  });
});
