import { describe, it, expect } from "vitest";
import {
  surfaceForTemplate,
  CLONEABLE_TEMPLATE_IDS,
  TEMPLATE_SETTING_FIELDS,
} from "@core-plugins/themes/templates";

describe("CLONEABLE_TEMPLATE_IDS", () => {
  it("contains exactly the 4 cloneable parents", () => {
    expect(CLONEABLE_TEMPLATE_IDS).toEqual([
      "single-page",
      "single-post",
      "single-pillar",
      "topic-archive",
    ]);
  });

  it("does not contain homepage, not-found, search-results, author", () => {
    const set = new Set(CLONEABLE_TEMPLATE_IDS as readonly string[]);
    for (const id of ["homepage", "not-found", "search-results", "author"]) {
      expect(set.has(id)).toBe(false);
    }
  });
});

describe("TEMPLATE_SETTING_FIELDS", () => {
  it("contains exactly the 6 per-template setting fields", () => {
    expect(TEMPLATE_SETTING_FIELDS).toContain("column_preset");
    expect(TEMPLATE_SETTING_FIELDS).toContain("show_left_sidebar");
    expect(TEMPLATE_SETTING_FIELDS).toContain("show_right_sidebar");
    expect(TEMPLATE_SETTING_FIELDS).toContain("custom_left_sidebar");
    expect(TEMPLATE_SETTING_FIELDS).toContain("custom_right_sidebar");
    expect(TEMPLATE_SETTING_FIELDS).toContain("expand_main_when_no_sidebars");
    expect(TEMPLATE_SETTING_FIELDS).toHaveLength(6);
  });
});

describe("surfaceForTemplate", () => {
  it("returns the built-in surface for a known built-in id with no parent", () => {
    expect(surfaceForTemplate("single-post", null)).toBe("template-single-post");
    expect(surfaceForTemplate("homepage", null)).toBe("template-homepage");
    expect(surfaceForTemplate("not-found", null)).toBe("template-not-found");
  });

  it("returns the parent's surface for a custom template", () => {
    expect(surfaceForTemplate("product-page", "single-page")).toBe("template-single-page");
    expect(surfaceForTemplate("essay", "single-post")).toBe("template-single-post");
  });

  it("returns null for an unknown id with no parent (defensive)", () => {
    expect(surfaceForTemplate("completely-unknown", null)).toBeNull();
  });
});
