import { describe, it, expect, beforeEach } from "vitest";
import {
  registerBlock,
  buildPuckConfigForSurface,
  type RegisteredBlock,
} from "../../../../src/core/blocks/registry";

// The registry pins itself to globalThis under this key so HMR can
// reuse the same Map across module re-evaluations. The test clears
// it before each case so registrations don't leak between tests.
const REGISTRY_KEY = "__nextpress_block_registry__" as const;

function clearRegistry(): void {
  const g = globalThis as unknown as Record<
    string,
    Map<string, RegisteredBlock> | undefined
  >;
  g[REGISTRY_KEY] = new Map();
}

function noopConfig() {
  return {
    fields: {},
    defaultProps: {},
    render: () => null,
  } as unknown as RegisteredBlock["config"];
}

function fakeBlock(
  name: string,
  category: string,
): RegisteredBlock {
  return {
    name,
    config: noopConfig(),
    surfaces: ["template-single-post"],
    category,
    source: "core",
  };
}

describe("blocks/registry — category ordering", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("places Template before Layout, Media, Sections, Text, and Site in the surface config", () => {
    // Registration order intentionally puts the non-Template blocks
    // first to prove the order isn't insertion-driven.
    registerBlock(fakeBlock("LayoutA", "Layout"));
    registerBlock(fakeBlock("MediaA", "Media"));
    registerBlock(fakeBlock("SectionsA", "Sections"));
    registerBlock(fakeBlock("SiteA", "Site"));
    registerBlock(fakeBlock("TemplateA", "Template"));

    const config = buildPuckConfigForSurface("template-single-post");
    const orderedCategoryTitles = Object.values(config.categories ?? {}).map(
      (c) => c.title,
    );

    expect(orderedCategoryTitles[0]).toBe("Template");
    expect(orderedCategoryTitles).toEqual([
      "Template",
      "Sections",
      "Media",
      "Layout",
      "Site",
    ]);
  });

  it("places unknown categories after the explicitly ranked ones", () => {
    registerBlock(fakeBlock("UnrankedA", "ZAlpha"));
    registerBlock(fakeBlock("TemplateA", "Template"));
    registerBlock(fakeBlock("SiteA", "Site"));

    const config = buildPuckConfigForSurface("template-single-post");
    const orderedCategoryTitles = Object.values(config.categories ?? {}).map(
      (c) => c.title,
    );

    expect(orderedCategoryTitles).toEqual(["Template", "Site", "ZAlpha"]);
  });
});
