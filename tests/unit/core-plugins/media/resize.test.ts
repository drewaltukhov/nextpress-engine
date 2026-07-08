import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { resizeOriginal } from "@core-plugins/media/resize";

/**
 * Make a synthetic raster image of the requested dimensions, encoded as WebP.
 * Useful for asserting Sharp's resize-on-input behavior end-to-end without
 * mocking Sharp itself — the real library is fast enough to run inline.
 */
async function makeWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

describe("resizeOriginal", () => {
  it("caps a 3000x4000 portrait at longest-edge ≤ 1920", async () => {
    const big = await makeWebp(3000, 4000);
    const result = await resizeOriginal(big, "image/webp");
    expect(result).not.toBeNull();
    const meta = await sharp(result!.data).metadata();
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1920);
    // Aspect preserved → height should be the long edge here.
    expect(meta.height).toBe(1920);
    expect(meta.width).toBe(1440);
  });

  it("caps a 4000x3000 landscape at longest-edge ≤ 1920", async () => {
    const big = await makeWebp(4000, 3000);
    const result = await resizeOriginal(big, "image/webp");
    expect(result).not.toBeNull();
    const meta = await sharp(result!.data).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1440);
  });

  it("does not enlarge a 1000x800 input", async () => {
    const small = await makeWebp(1000, 800);
    const result = await resizeOriginal(small, "image/webp");
    expect(result).not.toBeNull();
    const meta = await sharp(result!.data).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(800);
  });

  it("respects a custom maxLongEdge", async () => {
    const img = await makeWebp(800, 600);
    const result = await resizeOriginal(img, "image/webp", 400);
    expect(result).not.toBeNull();
    const meta = await sharp(result!.data).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("returns null on Sharp failure (non-image bytes)", async () => {
    const garbage = Buffer.from("not an image at all");
    const result = await resizeOriginal(garbage, "image/webp");
    expect(result).toBeNull();
  });

  it("preserves PNG format for PNG input", async () => {
    const png = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const result = await resizeOriginal(png, "image/png");
    expect(result).not.toBeNull();
    const meta = await sharp(result!.data).metadata();
    expect(meta.format).toBe("png");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1920);
  });
});
