import { randomUUID } from "node:crypto";
import type { EmailTransport, SendInput, SendResult } from "./types";

/**
 * Dev / fallback transport that logs payloads instead of sending.
 * Selected when EMAIL_TRANSPORT is unset or === "console".
 */
export class ConsoleEmailTransport implements EmailTransport {
  readonly id = "console";

  async verify(): Promise<void> {
    // No external dependency to verify.
  }

  async send(input: SendInput): Promise<SendResult> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const messageId = `console.${randomUUID()}@nextpress.local`;
    const lines = [
      `╭─ [email/console] ${messageId}`,
      `│  from: ${input.from ?? "(default)"}`,
      `│  to:   ${recipients.join(", ")}`,
      `│  subject: ${input.subject}`,
      input.text ? `│  text: ${input.text.split("\n").slice(0, 3).join(" ⏎ ").slice(0, 200)}` : null,
      "╰─"
    ].filter((s): s is string => s !== null);
    console.log(lines.join("\n"));

    return {
      messageId,
      accepted: recipients,
      rejected: [],
      response: "logged-to-console"
    };
  }

  close(): void {
    // No resources to release.
  }
}
