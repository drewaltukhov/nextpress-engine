import { describe, it, expect } from "vitest";

// theme-blocks.tsx is client-safe — no db, no settings, no next-auth
// in its dependency graph. We side-effect-import it here to populate
// the global block registry, then assert what landed.
import "../../../../plugins/crypto-beat/theme-blocks";
import { listAllBlocks } from "@core/blocks/registry";

describe("crypto-beat — theme block registration", () => {
  it("registers Prices block with the plugin:crypto-beat: prefix", () => {
    const block = listAllBlocks().find(
      (b) => b.name === "plugin:crypto-beat:Prices",
    );
    expect(block).toBeDefined();
    expect(block?.source).toBe("plugin:crypto-beat");
    expect(block?.category).toBe("Crypto Beat");
    expect(block?.surfaces.length).toBe(12);
  });
});
