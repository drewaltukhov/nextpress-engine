import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("/api/health", () => {
  it("returns 200 with { status: 'ok', engine: 'nextpress', version }", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.engine).toBe("nextpress");
    expect(typeof body.version).toBe("string");
  });
});
