import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The server-action body limit applies to every action, including anonymous
// public ones, so it is kept to what the largest legitimate action needs:
// backup restore (zipped DB, media excluded). Media uploads go through
// /api/admin/media/upload, a route handler this limit does not govern
// (security audit 2026-11-12, nextpress:server-actions:global-100mb-body-limit).

describe("next.config serverActions.bodySizeLimit", () => {
  it("is 25mb, not 100mb", () => {
    const src = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(src).toMatch(/bodySizeLimit:\s*"25mb"/);
  });
});
