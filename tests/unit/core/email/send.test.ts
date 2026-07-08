import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HookBus } from "@core/hooks/bus";
import {
  ConsoleEmailTransport,
  registerEmailTransport,
  resetEmailTransport,
  sendEmail
} from "@core/email";

describe("sendEmail", () => {
  beforeEach(() => {
    resetEmailTransport();
    registerEmailTransport(new ConsoleEmailTransport());
  });
  afterEach(() => {
    resetEmailTransport();
  });

  it("delivers via the active transport", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendEmail({
      input: { to: "alice@example.com", subject: "hello", text: "hi" }
    });
    expect(result.accepted).toEqual(["alice@example.com"]);
    expect(result.messageId).toMatch(/^console\./);
    log.mockRestore();
  });

  it("runs the email.send filter chain when a HookBus is provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bus = new HookBus();
    bus.filter(
      "email.send" as never,
      (async ({ value }: { value: { subject: string } }) => ({
        ...value,
        subject: `[FILTERED] ${value.subject}`
      })) as never,
      { pluginSlug: "test" }
    );
    const transport = new ConsoleEmailTransport();
    registerEmailTransport(transport);
    const sendSpy = vi.spyOn(transport, "send");

    await sendEmail({
      bus,
      input: { to: "alice@example.com", subject: "hello", text: "hi" }
    });

    // Filter result then has the NextPress brand prefix applied on top.
    expect(sendSpy.mock.calls[0][0].subject).toBe("NextPress: [FILTERED] hello");
    log.mockRestore();
  });

  it("prefixes subjects with the NextPress brand", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const transport = new ConsoleEmailTransport();
    registerEmailTransport(transport);
    const sendSpy = vi.spyOn(transport, "send");

    await sendEmail({ input: { to: "a@b", subject: "Reset your password", text: "x" } });
    expect(sendSpy.mock.calls[0][0].subject).toBe("NextPress: Reset your password");

    // Idempotent — already-prefixed subjects pass through unchanged.
    await sendEmail({ input: { to: "a@b", subject: "NextPress: Welcome", text: "x" } });
    expect(sendSpy.mock.calls[1][0].subject).toBe("NextPress: Welcome");
    log.mockRestore();
  });

  it("passes transport id + tenantId through the hook context", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bus = new HookBus();
    let seenCtx: { tenantId: number; transportId: string } | null = null;
    bus.filter(
      "email.send" as never,
      (async ({ value, ctx }: { value: unknown; ctx: { tenantId: number; transportId: string } }) => {
        seenCtx = ctx;
        return value;
      }) as never,
      { pluginSlug: "test" }
    );
    await sendEmail({ bus, input: { to: "x@x", subject: "s", text: "t" }, tenantId: 42 });
    expect(seenCtx).toEqual({ tenantId: 42, transportId: "console" });
    log.mockRestore();
  });
});
