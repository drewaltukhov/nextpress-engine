import { describe, it, expect } from "vitest";
import { createDbClient } from "@core/db/client";

describe("createDbClient", () => {
  it("creates a client backed by an in-memory libSQL database", async () => {
    const client = createDbClient({ databaseUrl: "file::memory:", authToken: undefined });
    const result = await client.execute("SELECT 1 AS x");
    expect(result.rows[0]?.x).toBe(1);
    client.close();
  });

  it("accepts an authToken without crashing on construction", () => {
    const client = createDbClient({ databaseUrl: "file::memory:", authToken: "ignored-locally" });
    expect(client).toBeDefined();
    client.close();
  });
});
