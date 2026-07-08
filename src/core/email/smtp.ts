import { createTransport, type Transporter, type SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { EmailTransport, SendInput, SendResult } from "./types";
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * SMTP is "configured" when every credential field a sender needs is set:
 * host, user, password, and from-address. Port has a defensible default
 * (587) and is treated as optional. We don't decrypt the password to
 * answer this — non-empty presence is enough.
 *
 * Each setting may arrive in one of three shapes from getSetting():
 *   - `string`         — plain text settings (host, user, from_address)
 *   - `object`         — encrypted payload `{ ciphertext, iv, authTag }`
 *                         returned for `smtp.password` when no secret is
 *                         passed (we deliberately don't decrypt here)
 *   - `null|undefined` — never set or deleted
 *
 * Used by the dashboard banner, system-health widget, and notifications
 * bell to surface a setup prompt when a fresh install hasn't filled these
 * in. A truthy `smtp.host` alone is not enough: a demo seed (or partial
 * restore) can leave the host populated as a placeholder while the
 * credentials are blank.
 */
export async function isSmtpConfigured(db: DbClient): Promise<boolean> {
  const [host, user, password, fromAddress] = await Promise.all([
    getSetting<unknown>(db, "smtp.host"),
    getSetting<unknown>(db, "smtp.user"),
    getSetting<unknown>(db, "smtp.password"),
    getSetting<unknown>(db, "smtp.from_address"),
  ]);
  return isSet(host) && isSet(user) && isSet(password) && isSet(fromAddress);
}

function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  defaultFrom: string;
}

/**
 * Generic SMTP transport via nodemailer. Reads host/port/credentials from
 * its config — values typically come from the DB-backed settings registry
 * (smtp.host / smtp.port / smtp.user / smtp.password / smtp.from_address).
 *
 * Port 465 uses implicit TLS; everything else uses STARTTLS-style upgrade.
 */
export class SmtpTransport implements EmailTransport {
  readonly id = "smtp";
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;
  private verified = false;

  constructor(config: SmtpConfig) {
    this.defaultFrom = config.defaultFrom;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 100
    });
  }

  async verify(): Promise<void> {
    if (this.verified) return;
    await this.transporter.verify();
    this.verified = true;
  }

  async send(input: SendInput): Promise<SendResult> {
    await this.verify();
    const opts: SendMailOptions = {
      from: input.from ?? this.defaultFrom,
      to: Array.isArray(input.to) ? [...(input.to as readonly string[])] : (input.to as string),
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      headers: input.headers
    };
    const info = (await this.transporter.sendMail(opts)) as SMTPTransport.SentMessageInfo;
    return {
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
      response: info.response
    };
  }

  close(): void {
    this.transporter.close();
  }
}
