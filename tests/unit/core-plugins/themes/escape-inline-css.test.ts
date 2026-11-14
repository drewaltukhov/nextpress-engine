import { describe, it, expect } from "vitest";
import { escapeInlineCss, rebaseCssUrls } from "@core-plugins/themes/user-overrides-css";

// Custom CSS is inlined into <head> as <style>; no input may close that
// element. A single-pass strip of `</style` was bypassable by nesting.
describe("escapeInlineCss", () => {
  it("cannot be broken out of with a nested </style payload", () => {
    for (const payload of [
      "</style><script>alert(1)</script>",
      "</sty</stylele><script>alert(1)</script>",
      "a{}</st</styleyle><script>alert(1)</script>",
      "</STYLE ><img src=x onerror=alert(1)>",
    ]) {
      const out = escapeInlineCss(payload);
      expect(out).not.toMatch(/<\/style/i);
      expect(out).not.toContain("</");
    }
  });

  it("leaves ordinary CSS untouched", () => {
    const css = ".a > .b { color: red; }\n@media (max-width: 767px) { .c { display: none; } }";
    expect(escapeInlineCss(css)).toBe(css);
  });

  it("leaves range-syntax queries (bare <) untouched", () => {
    const css = "@media (width < 640px) { .a { display: none; } }\n@container (400px <= inline-size < 900px) { .b { flex: 1; } }";
    expect(escapeInlineCss(css)).toBe(css);
  });

  it("keeps a literal </ inside a CSS string as its escape", () => {
    expect(escapeInlineCss('.x::before { content: "</"; }')).toBe('.x::before { content: "\\3c /"; }');
  });
});

// Inlined custom CSS must keep resolving relative refs against the route it
// used to be served from, not the current page.
describe("rebaseCssUrls", () => {
  const base = "/api/themes/nextpresso/";

  it("prefixes relative url() refs, quoted or not", () => {
    expect(rebaseCssUrls(".a{background:url(images/bg.png)}", base)).toBe(".a{background:url(/api/themes/nextpresso/images/bg.png)}");
    expect(rebaseCssUrls('.a{background:url( "img/x.svg" )}', base)).toBe('.a{background:url("/api/themes/nextpresso/img/x.svg")}');
    expect(rebaseCssUrls("@font-face{src:url('../fonts/f.woff2')}", base)).toBe("@font-face{src:url('/api/themes/nextpresso/../fonts/f.woff2')}");
  });

  it("prefixes a relative @import string", () => {
    expect(rebaseCssUrls('@import "extra.css";', base)).toBe('@import "/api/themes/nextpresso/extra.css";');
  });

  it("leaves absolute, root-relative, data: and fragment refs alone", () => {
    const css = [
      ".a{background:url(https://cdn.example.com/x.png)}",
      ".b{background:url(//cdn.example.com/x.png)}",
      ".c{background:url(/media/123)}",
      ".d{background:url(data:image/png;base64,AAAA)}",
      ".e{filter:url(#blur)}",
      '@import "https://fonts.example.com/f.css";',
    ].join("\n");
    expect(rebaseCssUrls(css, base)).toBe(css);
  });
});

describe("rebaseCssUrls — malformed input", () => {
  it("stays fast on an unclosed url( followed by a long whitespace run", () => {
    const css = "a{background:url(" + " ".repeat(50_000);
    const start = performance.now();
    expect(rebaseCssUrls(css, "/api/themes/x/")).toBe(css);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("rebases quoted URLs that contain spaces or parentheses", () => {
    expect(rebaseCssUrls('.a{background:url("my img (2).png")}', "/b/")).toBe('.a{background:url("/b/my img (2).png")}');
  });
});
