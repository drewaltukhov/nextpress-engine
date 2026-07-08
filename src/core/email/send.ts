import type { HookBus } from "@core/hooks/bus";
import type { SendInput, SendResult } from "./types";
import { getEmailTransport } from "./registry";

export interface SendArgs {
  bus?: HookBus;
  input: SendInput;
  tenantId?: number;
}

/**
 * The single send entry point used by the kernel and core-plugins.
 * Runs the email.send filter chain (so plugins can transform the message —
 * footer, tracking, redaction) before handing it to the active transport.
 */
const SUBJECT_PREFIX = "NextPress: ";

function applyBrandPrefix(input: SendInput): SendInput {
  if (input.subject.startsWith(SUBJECT_PREFIX)) return input;
  return { ...input, subject: `${SUBJECT_PREFIX}${input.subject}` };
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const transport = await getEmailTransport();
  const tenantId = args.tenantId ?? 1;

  const filtered = args.bus
    ? ((await args.bus.applyFilters(
        "email.send" as never,
        args.input as never,
        { tenantId, transportId: transport.id } as never
      )) as SendInput)
    : args.input;

  return transport.send(applyBrandPrefix(filtered));
}
