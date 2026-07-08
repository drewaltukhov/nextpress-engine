// Pure, sync helpers shared by the server actions and client dialogs.
// MUST NOT have "use server" — server-action files require async exports
// and would reject this synchronous function.

// `.local` is an RFC-reserved TLD — addresses there can never receive mail.
// Used as the seed admin's placeholder so we can detect "unreachable" users
// and route them through the bootstrap claim flow.
export function isUnverifiableEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at < 0) return false;
  return lower.slice(at + 1).endsWith(".local");
}
