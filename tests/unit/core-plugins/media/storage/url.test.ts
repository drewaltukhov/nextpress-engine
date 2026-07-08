import { describe, it, expect } from "vitest";
import { getMediaPublicUrl, toFeaturedThumbVariant } from "@core-plugins/media/storage/url";

const V = "abcd1234"; // any 8-char content version

describe("getMediaPublicUrl", () => {
  it("returns /media/<id>?v=<contentVersion> for original variant", () => {
    expect(
      getMediaPublicUrl({ id: "abc-123", hasThumb: true, variant: "original", contentVersion: V })
    ).toBe(`/media/abc-123?v=${V}`);
  });

  it("returns /media/<id>/thumb?v=<contentVersion> when hasThumb=true", () => {
    expect(
      getMediaPublicUrl({ id: "abc-123", hasThumb: true, variant: "thumb", contentVersion: V })
    ).toBe(`/media/abc-123/thumb?v=${V}`);
  });

  it("falls back to original when variant is thumb but hasThumb is false", () => {
    expect(
      getMediaPublicUrl({ id: "abc-123", hasThumb: false, variant: "thumb", contentVersion: V })
    ).toBe(`/media/abc-123?v=${V}`);
  });

  it("omits the ?v= suffix when contentVersion is empty", () => {
    expect(
      getMediaPublicUrl({ id: "abc-123", hasThumb: true, variant: "thumb", contentVersion: "" })
    ).toBe("/media/abc-123/thumb");
  });

  it("uses the same URL form for any backend (the contentVersion is what changes)", () => {
    // Same row, different content versions → distinct URLs (cache-bust on migration).
    const dbUrl = getMediaPublicUrl({ id: "abc", hasThumb: true, variant: "thumb", contentVersion: "dbhash01" });
    const r2Url = getMediaPublicUrl({ id: "abc", hasThumb: true, variant: "thumb", contentVersion: "r2hash02" });
    expect(dbUrl).not.toBe(r2Url);
    expect(dbUrl).toBe("/media/abc/thumb?v=dbhash01");
    expect(r2Url).toBe("/media/abc/thumb?v=r2hash02");
  });
});

describe("toFeaturedThumbVariant", () => {
  it("transforms /media/<id> → /media/<id>/thumb", () => {
    expect(toFeaturedThumbVariant("/media/abc-123")).toBe("/media/abc-123/thumb");
  });

  it("is idempotent on already-thumb URLs", () => {
    expect(toFeaturedThumbVariant("/media/abc-123/thumb")).toBe("/media/abc-123/thumb");
  });

  it("preserves query and hash on /media route transforms", () => {
    expect(toFeaturedThumbVariant("/media/abc-123?v=abcd1234")).toBe("/media/abc-123/thumb?v=abcd1234");
    expect(toFeaturedThumbVariant("/media/abc-123#hero")).toBe("/media/abc-123/thumb#hero");
  });

  it("leaves external URLs untouched", () => {
    expect(toFeaturedThumbVariant("https://other.example.com/img.png")).toBe(
      "https://other.example.com/img.png"
    );
  });

  it("passes through null/undefined unchanged", () => {
    expect(toFeaturedThumbVariant(null)).toBeNull();
    expect(toFeaturedThumbVariant(undefined)).toBeNull();
  });

  it("passes through empty string unchanged", () => {
    expect(toFeaturedThumbVariant("")).toBe("");
  });
});
