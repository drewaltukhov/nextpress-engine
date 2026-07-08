// Pure constants used by both the server actions and the form. Extracted out
// of website-actions.ts because "use server" files can only export async
// functions — exporting plain objects from a server-action module is a
// build-time error.

export const DATE_FORMAT_OPTIONS = [
  { value: "MMM d, yyyy", label: "May 1, 2026" },
  { value: "yyyy-MM-dd", label: "2026-05-01" },
  { value: "d MMM yyyy", label: "1 May 2026" },
  { value: "MM/dd/yyyy", label: "05/01/2026" },
  { value: "dd/MM/yyyy", label: "01/05/2026" },
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour (3:45 PM)" },
  { value: "24h", label: "24-hour (15:45)" },
] as const;
