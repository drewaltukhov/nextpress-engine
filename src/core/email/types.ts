export interface SendInput {
  to: string | readonly string[];
  from?: string;            // defaults to the smtp.from_address setting
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  accepted: readonly string[];
  rejected: readonly string[];
  response?: string;
}

export interface EmailTransport {
  /** Stable identifier — 'gmail-smtp', 'console', plugin-defined slugs, etc. */
  readonly id: string;

  /** Throw if the transport can't reach its provider; called once on first use. */
  verify(): Promise<void>;

  send(input: SendInput): Promise<SendResult>;

  /** Release any pooled connections. */
  close(): void;
}

export interface EmailContext {
  tenantId: number;
  transportId: string;
}

// Extend the global FilterMap so plugins can hook into `email.send`.
// Filter receives the SendInput and may return a transformed SendInput.
declare module "@core/hooks/types" {
  interface FilterMap {
    "email.send": { value: SendInput; ctx: EmailContext };
  }
}
