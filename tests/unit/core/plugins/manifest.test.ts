import { describe, it, expect } from "vitest";
import { manifestSchema, parseManifest } from "@core/plugins/manifest";

describe("manifestSchema", () => {
  it("accepts a minimal valid manifest", () => {
    const parsed = manifestSchema.parse({
      slug: "comments",
      name: "Comments",
      version: "1.0.0",
      engine: "^1.0.0"
    });
    expect(parsed.slug).toBe("comments");
    expect(parsed.tier).toBe("standard");
    expect(parsed.dependencies).toEqual([]);
  });

  it("accepts a full manifest with tier, deps, capabilities", () => {
    const parsed = manifestSchema.parse({
      slug: "seo",
      name: "SEO",
      version: "1.0.0",
      engine: "^1.0.0",
      tier: "essential",
      dependencies: ["posts"],
      capabilities: { exposes_hooks: ["seo.beforeRender"] }
    });
    expect(parsed.tier).toBe("essential");
  });

  it("rejects an invalid slug (uppercase)", () => {
    expect(() =>
      manifestSchema.parse({ slug: "MyPlugin", name: "X", version: "1.0.0", engine: "^1.0.0" })
    ).toThrow();
  });

  it("rejects an unknown tier", () => {
    expect(() =>
      manifestSchema.parse({
        slug: "x",
        name: "X",
        version: "1.0.0",
        engine: "^1.0.0",
        tier: "premium"
      })
    ).toThrow();
  });
});

describe("parseManifest", () => {
  it("returns a PluginManifest with normalized defaults", () => {
    const m = parseManifest({ slug: "x", name: "X", version: "1.0.0", engine: "^1.0.0" });
    expect(m.tier).toBe("standard");
    expect(m.dependencies).toEqual([]);
    expect(m.type).toBe("plugin");
  });

  it("recognizes type=theme manifests", () => {
    const m = parseManifest({
      slug: "default",
      name: "Default",
      version: "1.0.0",
      engine: "^1.0.0",
      type: "theme"
    });
    expect(m.type).toBe("theme");
  });
});
