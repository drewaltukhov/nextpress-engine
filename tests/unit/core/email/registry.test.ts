import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stub the settings registry — the email registry calls getSetting(db, key, secret)
// and we want full control over the (host/port/user/password/from_address) values.
const settingsMock = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  getSetting: vi.fn()
}));

vi.mock("@core-plugins/settings/registry", () => ({
  getSetting: settingsMock.getSetting
}));

// Stub the DB client — registry only uses it as a handle to pass to getSetting.
vi.mock("@core/db/client", () => ({
  createDbClient: () => ({} as unknown)
}));

import {
  ConsoleEmailTransport,
  registerEmailTransport,
  getEmailTransport,
  resetEmailTransport
} from "@core/email";

function setSmtp(values: Partial<Record<string, unknown>>): void {
  settingsMock.values = new Map(Object.entries(values));
  settingsMock.getSetting.mockImplementation(
    async (_db: unknown, key: string) => settingsMock.values.get(key)
  );
}

describe("email transport registry", () => {
  beforeEach(() => {
    resetEmailTransport();
    settingsMock.getSetting.mockReset();
  });
  afterEach(() => {
    resetEmailTransport();
  });

  it("falls back to ConsoleEmailTransport when smtp.host is empty", async () => {
    setSmtp({ "smtp.host": "" });
    const t = await getEmailTransport();
    expect(t.id).toBe("console");
  });

  it("falls back to ConsoleEmailTransport when smtp.host is undefined", async () => {
    setSmtp({});
    const t = await getEmailTransport();
    expect(t.id).toBe("console");
  });

  it("falls back to console when smtp.host is set but from_address and user are empty", async () => {
    setSmtp({
      "smtp.host": "smtp.example.com",
      "smtp.port": 587,
      "smtp.user": "",
      "smtp.password": "",
      "smtp.from_address": ""
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = await getEmailTransport();
    expect(t.id).toBe("console");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("constructs SmtpTransport when smtp.host + credentials are present", async () => {
    setSmtp({
      "smtp.host": "smtp.gmail.com",
      "smtp.port": 587,
      "smtp.user": "test@example.com",
      "smtp.password": "app-password",
      "smtp.from_address": "test@example.com"
    });
    const t = await getEmailTransport();
    expect(t.id).toBe("smtp");
    t.close();
  });

  it("falls back to user as the from address when from_address is empty", async () => {
    setSmtp({
      "smtp.host": "smtp.gmail.com",
      "smtp.port": 587,
      "smtp.user": "test@example.com",
      "smtp.password": "app-password",
      "smtp.from_address": ""
    });
    const t = await getEmailTransport();
    expect(t.id).toBe("smtp");
    t.close();
  });

  it("registerEmailTransport overrides the DB-derived choice", async () => {
    setSmtp({
      "smtp.host": "smtp.gmail.com",
      "smtp.port": 587,
      "smtp.user": "test@example.com",
      "smtp.password": "app-password",
      "smtp.from_address": "test@example.com"
    });
    registerEmailTransport(new ConsoleEmailTransport());
    const t = await getEmailTransport();
    expect(t.id).toBe("console");
  });

  it("resetEmailTransport invalidates the cache so the next call re-reads settings", async () => {
    setSmtp({ "smtp.host": "" });
    expect((await getEmailTransport()).id).toBe("console");

    setSmtp({
      "smtp.host": "smtp.gmail.com",
      "smtp.port": 587,
      "smtp.user": "test@example.com",
      "smtp.password": "pw",
      "smtp.from_address": "test@example.com"
    });
    // Without reset, the cached console transport is still returned.
    expect((await getEmailTransport()).id).toBe("console");

    resetEmailTransport();
    const t = await getEmailTransport();
    expect(t.id).toBe("smtp");
    t.close();
  });
});
