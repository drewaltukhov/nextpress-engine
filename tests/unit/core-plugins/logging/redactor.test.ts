import { describe, it, expect } from "vitest";
import { redact } from "@core-plugins/logging/redactor";

describe("redact", () => {
  it("masks secret-named keys at any depth", () => {
    const input = {
      ok: "visible",
      password: "hunter2",
      nested: { apiKey: "sk-1234", token: "abcd" },
      list: [{ refresh_token: "r" }]
    };
    const out = redact(input);
    expect(out.ok).toBe("visible");
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.apiKey).toBe("[REDACTED]");
    expect(out.nested.token).toBe("[REDACTED]");
    expect(out.list[0].refresh_token).toBe("[REDACTED]");
  });

  it("masks Bearer tokens and JWTs in string values", () => {
    expect(redact("Bearer abcdefghijk")).toMatch(/\*\*\*/);
    expect(redact("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.ABCDEFGH")).toMatch(/\*\*\*/);
  });

  it("leaves non-secret strings alone", () => {
    expect(redact("hello world")).toBe("hello world");
  });

  it("does not mutate the input", () => {
    const input = { password: "p", a: 1 };
    redact(input);
    expect(input.password).toBe("p");
  });
});
