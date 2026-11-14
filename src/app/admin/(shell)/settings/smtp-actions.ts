"use server";

import { createTransport } from "nodemailer";
import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { resetEmailTransport } from "@core/email";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
}

/**
 * What the settings page receives. The stored password never leaves the
 * server; the form only needs to know whether one is on file
 * (security audit 2026-11-12).
 */
export interface SmtpSettingsView {
  host: string;
  port: number;
  user: string;
  passwordConfigured: boolean;
  fromAddress: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

// SMTP settings are admin-only: they decide where password-reset mail goes
// and hold the mail credential. Server actions are directly invokable, so
// each one checks the role itself.
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false as const, error: "Only administrators can change email settings" };
  }
  return { ok: true as const, session };
}

export async function getSmtpSettings(): Promise<SmtpSettingsView> {
  const empty = { host: "", port: 587, user: "", passwordConfigured: false, fromAddress: "" };
  const admin = await requireAdmin();
  if (!admin.ok) return empty;
  const secret = process.env.AUTH_SECRET;
  const [host, port, user, password, fromAddress] = await Promise.all([
    getSetting<string>(db(), "smtp.host"),
    getSetting<number>(db(), "smtp.port"),
    getSetting<string>(db(), "smtp.user"),
    getSetting<string>(db(), "smtp.password", secret),
    getSetting<string>(db(), "smtp.from_address"),
  ]);
  return {
    host: host ?? "",
    port: port ?? 587,
    user: user ?? "",
    passwordConfigured: Boolean(password),
    fromAddress: fromAddress ?? "",
  };
}

export async function saveSmtpSettings(input: SmtpSettings): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  const session = admin.session;
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const secret = process.env.AUTH_SECRET;
  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId, secret };

  if (!input.password && input.host.trim()) {
    // A blank password keeps the stored one, so it must not be kept for a
    // different host: the next email would log in there with it. (Clearing
    // the host switches email off and sends the password nowhere.)
    const [storedHost, storedPassword] = await Promise.all([
      getSetting<string>(db(), "smtp.host"),
      getSetting<string>(db(), "smtp.password", secret),
    ]);
    if (storedPassword && input.host.trim() !== (storedHost ?? "")) {
      return { ok: false, error: "Enter the password for the new SMTP server" };
    }
  }

  try {
    await setSetting(db(), "smtp.host", input.host.trim(), opts);
    await setSetting(db(), "smtp.port", input.port, opts);
    await setSetting(db(), "smtp.user", input.user.trim(), opts);
    if (input.password) {
      // Only update password if the user actually typed one (empty input
      // means "keep existing"). The form leaves the field blank by default.
      await setSetting(db(), "smtp.password", input.password, opts);
    }
    await setSetting(db(), "smtp.from_address", input.fromAddress.trim(), opts);

    resetEmailTransport();
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export interface SmtpTestInput {
  host: string;
  port: number;
  user: string;
  password: string;
}

export type SmtpTestResult = { ok: true } | { ok: false; error: string };

export async function testSmtpConnection(input: SmtpTestInput): Promise<SmtpTestResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!input.host.trim()) {
    return { ok: false, error: "SMTP host is required" };
  }

  let password = input.password;
  if (!password) {
    // Test against the stored password if the form left the field blank —
    // but only for the stored server and account, so the credential is
    // never sent to a host it was not saved for.
    const [storedHost, storedPort, storedUser] = await Promise.all([
      getSetting<string>(db(), "smtp.host"),
      getSetting<number>(db(), "smtp.port"),
      getSetting<string>(db(), "smtp.user"),
    ]);
    const sameServer =
      input.host.trim() === (storedHost ?? "") &&
      input.port === (storedPort ?? 587) &&
      input.user.trim() === (storedUser ?? "");
    if (!sameServer) {
      return { ok: false, error: "Enter the password to test a server other than the saved one" };
    }
    const secret = process.env.AUTH_SECRET;
    password = (await getSetting<string>(db(), "smtp.password", secret)) ?? "";
  }

  try {
    const transporter = createTransport({
      host: input.host,
      port: input.port,
      secure: input.port === 465,
      auth: input.user ? { user: input.user, pass: password } : undefined,
    });
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { ok: false, error: message };
  }
}
