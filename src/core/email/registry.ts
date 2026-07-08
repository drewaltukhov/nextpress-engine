import type { EmailTransport } from "./types";
import { ConsoleEmailTransport } from "./console";
import { SmtpTransport } from "./smtp";
import { createDbClient, type DbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * Pick the email transport from the DB-backed settings registry.
 * smtp.host present → SmtpTransport (with smtp.port/user/password/from_address).
 * Otherwise → ConsoleEmailTransport (dev fallback that logs to stdout).
 *
 * Plugins can override by calling registerEmailTransport() during their register().
 * Call resetEmailTransport() after saving SMTP settings so the next send picks
 * up the new credentials.
 */
let activeTransport: EmailTransport | null = null;
let buildPromise: Promise<EmailTransport> | null = null;

let cachedDb: DbClient | null = null;
function db(): DbClient {
  if (cachedDb) return cachedDb;
  const env = readEnv();
  cachedDb = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  return cachedDb;
}

export function registerEmailTransport(transport: EmailTransport): void {
  if (activeTransport) activeTransport.close();
  activeTransport = transport;
  buildPromise = null;
}

export async function getEmailTransport(): Promise<EmailTransport> {
  if (activeTransport) return activeTransport;
  if (!buildPromise) buildPromise = buildFromSettings();
  activeTransport = await buildPromise;
  return activeTransport;
}

export function resetEmailTransport(): void {
  if (activeTransport) activeTransport.close();
  activeTransport = null;
  buildPromise = null;
}

/** @deprecated Use resetEmailTransport — kept for older test imports. */
export const resetEmailTransportForTests = resetEmailTransport;

async function buildFromSettings(): Promise<EmailTransport> {
  try {
    const secret = process.env.AUTH_SECRET;
    const client = db();
    const [host, port, user, password, fromAddress] = await Promise.all([
      getSetting<string>(client, "smtp.host"),
      getSetting<number>(client, "smtp.port"),
      getSetting<string>(client, "smtp.user"),
      getSetting<string>(client, "smtp.password", secret),
      getSetting<string>(client, "smtp.from_address")
    ]);

    if (!host || host.trim() === "") {
      return new ConsoleEmailTransport();
    }

    const from = fromAddress?.trim() || user?.trim() || "";
    if (!from) {
      console.warn(
        "[email/registry] smtp.host is set but smtp.from_address and smtp.user are empty; falling back to console transport."
      );
      return new ConsoleEmailTransport();
    }

    return new SmtpTransport({
      host: host.trim(),
      port: port ?? 587,
      user: user?.trim() ?? "",
      password: password ?? "",
      defaultFrom: from
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email/registry] Failed to load SMTP settings (${message}); falling back to console transport.`);
    return new ConsoleEmailTransport();
  }
}
