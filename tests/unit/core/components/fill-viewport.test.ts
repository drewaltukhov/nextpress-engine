import { describe, expect, it } from "vitest";
import { fillHeight, FILL_MIN_HEIGHT } from "@core/components/use-fill-viewport";

// The post and page editors fit the window: the editor block (widgets, canvas,
// inspector, right sidebar) is sized to what is left below it, so the page itself
// never scrolls and each column scrolls on its own.
describe("fillHeight", () => {
  it("is the window height minus where the block starts and the gap below it", () => {
    expect(fillHeight(1000, 260, 32)).toBe(708);
  });

  it("rounds down so the page never gains a 1px scroll", () => {
    expect(fillHeight(1000.6, 260.3, 32)).toBe(708);
  });

  it("never goes below the minimum on a short window (the page scrolls instead)", () => {
    expect(fillHeight(700, 254, 32)).toBe(FILL_MIN_HEIGHT);
    expect(FILL_MIN_HEIGHT).toBe(600);
  });
});
