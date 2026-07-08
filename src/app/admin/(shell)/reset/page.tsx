import type { Metadata } from "next";
import { ResetPageClient } from "./ResetPageClient";

export const metadata: Metadata = { title: "Reset site" };

export default function ResetPage() {
  return <ResetPageClient />;
}
