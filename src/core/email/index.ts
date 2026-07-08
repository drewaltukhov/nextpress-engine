export type { EmailTransport, SendInput, SendResult, EmailContext } from "./types";
export { ConsoleEmailTransport } from "./console";
export { SmtpTransport, type SmtpConfig } from "./smtp";
export {
  registerEmailTransport,
  getEmailTransport,
  resetEmailTransport,
  resetEmailTransportForTests
} from "./registry";
export { sendEmail, type SendArgs } from "./send";
