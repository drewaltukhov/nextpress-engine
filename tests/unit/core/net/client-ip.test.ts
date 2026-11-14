import { describe, it, expect, afterEach } from "vitest";
import { getClientCountry, getClientIp } from "@core/net/client-ip";

// Each platform's edge headers are trusted only on that platform: on Vercel
// only x-vercel-forwarded-for (every other header is client-settable there);
// off Vercel x-vercel-forwarded-for is client-settable and never read
// (security audit 2026-11-12).

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const spoofed = new Headers({
  "x-vercel-forwarded-for": "203.0.113.7",
  "cf-connecting-ip": "198.51.100.20",
  "x-real-ip": "198.51.100.30",
  "x-forwarded-for": "198.51.100.40, 10.0.0.1",
});

describe("getClientIp", () => {
  it("ignores x-vercel-forwarded-for off Vercel", () => {
    delete process.env.VERCEL;
    delete process.env.CLIENT_IP_HEADER;
    expect(getClientIp(spoofed)).not.toBe("203.0.113.7");
  });

  it("prefers Cloudflare's cf-connecting-ip by default off Vercel", () => {
    delete process.env.VERCEL;
    delete process.env.CLIENT_IP_HEADER;
    expect(getClientIp(spoofed)).toBe("198.51.100.20");
  });

  it("reads only x-vercel-forwarded-for when VERCEL=1", () => {
    process.env.VERCEL = "1";
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(getClientIp(spoofed)).toBe("203.0.113.7");
    // Client-settable on Vercel: a request without the edge header must not
    // fall back to cf-connecting-ip / x-real-ip / x-forwarded-for.
    expect(
      getClientIp(new Headers({ "cf-connecting-ip": "198.51.100.20", "x-forwarded-for": "198.51.100.40" }))
    ).toBe("0.0.0.0");
  });

  it("uses only the configured CLIENT_IP_HEADER when set", () => {
    delete process.env.VERCEL;
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(getClientIp(spoofed)).toBe("198.51.100.30");
    expect(getClientIp(new Headers({ "cf-connecting-ip": "198.51.100.20" }))).toBe("0.0.0.0");
  });

  it("falls back to x-real-ip, then the first x-forwarded-for hop, then 0.0.0.0", () => {
    delete process.env.VERCEL;
    delete process.env.CLIENT_IP_HEADER;
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.30", "x-forwarded-for": "198.51.100.40" }))).toBe("198.51.100.30");
    expect(getClientIp(new Headers({ "x-forwarded-for": "198.51.100.40, 10.0.0.1" }))).toBe("198.51.100.40");
    expect(getClientIp(new Headers())).toBe("0.0.0.0");
  });
});

// Country hint for the country filter: x-vercel-ip-country on Vercel,
// Cloudflare's cf-ipcountry elsewhere (unknown is "XX", Tor is "T1"). Each is
// client-supplied on the other platform and ignored there.
describe("getClientCountry", () => {
  const both = new Headers({ "x-vercel-ip-country": "US", "cf-ipcountry": "DE" });

  it("off Vercel reads cf-ipcountry and ignores x-vercel-ip-country", () => {
    delete process.env.VERCEL;
    expect(getClientCountry(both)).toBe("DE");
    expect(getClientCountry(new Headers({ "x-vercel-ip-country": "US" }))).toBeNull();
  });

  it("on Vercel reads x-vercel-ip-country and ignores cf-ipcountry", () => {
    process.env.VERCEL = "1";
    expect(getClientCountry(both)).toBe("US");
    expect(getClientCountry(new Headers({ "cf-ipcountry": "DE" }))).toBeNull();
  });

  it("treats Cloudflare's unknown and Tor codes as no country", () => {
    delete process.env.VERCEL;
    expect(getClientCountry(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(getClientCountry(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(getClientCountry(new Headers({ "cf-ipcountry": "gb" }))).toBe("GB");
  });
});
