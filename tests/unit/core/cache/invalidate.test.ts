import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const updateTag = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  updateTag: (...a: unknown[]) => updateTag(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import { invalidateCacheTag } from "@core/cache/invalidate";

beforeEach(() => {
  updateTag.mockReset();
  revalidateTag.mockReset();
});

describe("invalidateCacheTag", () => {
  it("in a Server Action: uses updateTag (read-your-own-writes) and nothing else", () => {
    invalidateCacheTag("nextpress:posts");
    expect(updateTag).toHaveBeenCalledWith("nextpress:posts");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("in a Route Handler (updateTag throws): expires the tag immediately via revalidateTag", () => {
    updateTag.mockImplementation(() => {
      throw new Error("updateTag can only be called from within a Server Action.");
    });
    invalidateCacheTag("nextpress:posts");
    // expire: 0 — immediate, not the stale-while-revalidate "max" profile.
    expect(revalidateTag).toHaveBeenCalledWith("nextpress:posts", { expire: 0 });
  });

  it("outside any request (both throw): never throws, so the write still succeeds", () => {
    updateTag.mockImplementation(() => {
      throw new Error("no store");
    });
    revalidateTag.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing");
    });
    expect(() => invalidateCacheTag("nextpress:settings")).not.toThrow();
  });
});

// Guard: a direct `updateTag(` anywhere else silently no-ops in Route
// Handlers (the API) — exactly the bug this helper fixes.
const ROOT = join(__dirname, "..", "..", "..", "..");
const HELPER = "src/core/cache/invalidate.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (name === "node_modules" || name === "generated") continue;
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, abs).split(sep).join("/"));
  }
  return out;
}

describe("cache invalidation guard", () => {
  it("only the helper calls updateTag( directly", () => {
    const hits = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "plugins"))]
      .filter((f) => f !== HELPER)
      .flatMap((f) =>
        readFileSync(join(ROOT, f), "utf8")
          .split("\n")
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /\bupdateTag\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)),
      )
      .map(({ f, i, line }) => `${f}:${i}: ${line.trim()}`);
    expect(hits, `use invalidateCacheTag() from @core/cache/invalidate instead:\n${hits.join("\n")}`).toEqual([]);
  });
});
