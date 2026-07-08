import type { Metadata } from "next";
import { getRolesWithUsage } from "./actions";
import { RolesPageClient } from "./RolesPageClient";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const roles = await getRolesWithUsage();
  return <RolesPageClient roles={roles} />;
}
