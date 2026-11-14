import { describe, it, expect } from "vitest";

// next.config `headers()` overrides a route's own Content-Security-Policy, so
// the media sandbox must be set there: a /media/* rule, after the site-wide
// one (the later match wins), carrying `sandbox`. Found in the browser pass —
// the route-level header alone was silently replaced (security audit
// 2026-11-12, nextpress:media:svg-upload-served-same-origin-unsanitized).

describe("next.config headers for /media/*", () => {
  it("sandbox the media routes and keep the framing lockdown", async () => {
    const config = (await import("../../../next.config")).default;
    const rules = await config.headers!();
    const media = rules.filter((r) => r.source.startsWith("/media/"));
    expect(media.length).toBe(1);
    expect(rules.indexOf(media[0]!)).toBeGreaterThan(rules.findIndex((r) => r.source === "/(.*)"));
    const csp = media[0]!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("sandbox");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
