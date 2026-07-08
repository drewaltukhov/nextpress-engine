import { describe, expect, it } from "vitest";
import {
  COLUMN_PRESETS,
  CONTAINER_WIDTH_MODES,
  CONTAINER_WIDTH_PRESETS,
  computeContainerStyle,
  computeGridClasses,
} from "@core-plugins/themes/layout";

describe("computeGridClasses", () => {
  it("uses 4-column grid for 1/4-1/2-1/4", () => {
    const both = computeGridClasses({
      preset: "1/4-1/2-1/4",
      hasLeft: true,
      hasRight: true,
      expandWhenNoSidebars: true,
    });
    expect(both.gridColsClass).toBe("lg:grid-cols-4");
    expect(both.sidebarColSpanClass).toBe("lg:col-span-1");
    expect(both.mainColSpanClass).toBe("lg:col-span-2");
  });

  it("uses 3-column grid for 1/3-1/3-1/3", () => {
    const both = computeGridClasses({
      preset: "1/3-1/3-1/3",
      hasLeft: true,
      hasRight: true,
      expandWhenNoSidebars: true,
    });
    expect(both.gridColsClass).toBe("lg:grid-cols-3");
    expect(both.mainColSpanClass).toBe("lg:col-span-1");
  });

  it("expands main when no sidebars and expandWhenNoSidebars=true", () => {
    const result = computeGridClasses({
      preset: "1/4-1/2-1/4",
      hasLeft: false,
      hasRight: false,
      expandWhenNoSidebars: true,
    });
    expect(result.mainColSpanClass).toBe("lg:col-span-4");
  });

  it("centers main when sidebars are hidden and expandWhenNoSidebars=false", () => {
    const four = computeGridClasses({
      preset: "1/4-1/2-1/4",
      hasLeft: false,
      hasRight: false,
      expandWhenNoSidebars: false,
    });
    // 1/4-1/2-1/4 → main spans 2 of 4 cols and starts at col 2,
    // leaving cols 1 and 4 empty (visually centered).
    expect(four.mainColSpanClass).toBe("lg:col-span-2 lg:col-start-2");

    const three = computeGridClasses({
      preset: "1/3-1/3-1/3",
      hasLeft: false,
      hasRight: false,
      expandWhenNoSidebars: false,
    });
    // 1/3-1/3-1/3 → main spans 1 of 3 cols and starts at col 2,
    // leaving cols 1 and 3 empty.
    expect(three.mainColSpanClass).toBe("lg:col-span-1 lg:col-start-2");
  });

  it("widens main when only one sidebar is shown", () => {
    const four = computeGridClasses({
      preset: "1/4-1/2-1/4",
      hasLeft: true,
      hasRight: false,
      expandWhenNoSidebars: true,
    });
    expect(four.mainColSpanClass).toBe("lg:col-span-3");

    const three = computeGridClasses({
      preset: "1/3-1/3-1/3",
      hasLeft: false,
      hasRight: true,
      expandWhenNoSidebars: true,
    });
    expect(three.mainColSpanClass).toBe("lg:col-span-2");
  });
});

describe("computeContainerStyle", () => {
  it("returns empty class for fluid mode", () => {
    const result = computeContainerStyle({
      mode: "fluid",
      preset: "max-w-7xl",
      custom: "1280px",
    });
    expect(result.className).toBe("");
    expect(result.inlineStyle).toBeUndefined();
  });

  it("returns the preset class for preset mode", () => {
    const result = computeContainerStyle({
      mode: "preset",
      preset: "max-w-5xl",
      custom: "1280px",
    });
    expect(result.className).toBe("max-w-5xl");
    expect(result.inlineStyle).toBeUndefined();
  });

  it("returns inline style for custom mode", () => {
    const result = computeContainerStyle({
      mode: "custom",
      preset: "max-w-7xl",
      custom: "90rem",
    });
    expect(result.className).toBe("");
    expect(result.inlineStyle).toEqual({ maxWidth: "90rem" });
  });

  it("falls back to no constraint for empty custom width", () => {
    const result = computeContainerStyle({
      mode: "custom",
      preset: "max-w-7xl",
      custom: "   ",
    });
    expect(result.className).toBe("");
    expect(result.inlineStyle).toBeUndefined();
  });
});

describe("layout vocabulary", () => {
  it("exposes the documented column presets", () => {
    expect(COLUMN_PRESETS).toEqual(["1/4-1/2-1/4", "1/3-1/3-1/3"]);
  });

  it("exposes the documented container modes", () => {
    expect(CONTAINER_WIDTH_MODES).toEqual(["fluid", "preset", "custom"]);
  });

  it("includes all common Tailwind max-width presets", () => {
    expect(CONTAINER_WIDTH_PRESETS).toContain("max-w-7xl");
    expect(CONTAINER_WIDTH_PRESETS).toContain("max-w-3xl");
    expect(CONTAINER_WIDTH_PRESETS).toContain("max-w-full");
  });
});
