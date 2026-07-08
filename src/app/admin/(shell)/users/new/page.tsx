import type { Metadata } from "next";
import { getRoles } from "../actions";
import { NewUserPageClient } from "./NewUserPageClient";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  const roles = await getRoles();
  return <NewUserPageClient roles={roles} />;
}
