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

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function getSmtpSettings(): Promise<SmtpSettings> {
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
    password: password ?? "",
    fromAddress: fromAddress ?? "",
  };
}

export async function saveSmtpSettings(input: SmtpSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const secret = process.env.AUTH_SECRET;
  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId, secret };

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
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!input.host.trim()) {
    return { ok: false, error: "SMTP host is required" };
  }

  let password = input.password;
  if (!password) {
    // Test against the stored password if the form left the field blank.
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
