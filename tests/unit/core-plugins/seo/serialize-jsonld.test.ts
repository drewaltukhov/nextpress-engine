import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { serializeJsonLd, wrapJsonLdGraph } from "@core-plugins/seo/metadata";

// JSON-LD goes into a raw <script> element, so stored text containing
// "</script>" must not be able to close it (security audit 2026-11-12,
// nextpress:rendering:jsonld-script-breakout).

describe("serializeJsonLd", () => {
  it("escapes characters that could end the script element", () => {
    const out = serializeJsonLd(wrapJsonLdGraph([{ "@type": "Person", description: "</script><script>alert(1)</script>\u2028\u2029" }]));
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });

  it("round-trips to the same data", () => {
    const value = { a: "x < y & </script>", b: "line\u2028sep", n: [1, 2] };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });
});

describe("every JSON-LD script sink uses serializeJsonLd", () => {
  const root = resolve(process.cwd());
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules" && name !== "generated") walk(p);
      } else if (/\.tsx?$/.test(name)) files.push(p);
    }
  };
  for (const d of ["src", "plugins", "themes"]) walk(join(root, d));

  it("has no ld+json script fed by a bare JSON.stringify", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!src.includes('type="application/ld+json"')) return false;
      return /__html:\s*JSON\.stringify/.test(src) || /=\s*\n?\s*\S*\s*&&?\s*\n?\s*JSON\.stringify\(\s*\n?\s*wrapJsonLdGraph/.test(src);
    });
    expect(offenders.map((f) => f.replace(root + "/", ""))).toEqual([]);
  });
});
