import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser, getRoles } from "../../actions";
import { EditUserPageClient } from "./EditUserPageClient";

export const metadata: Metadata = { title: "Edit user" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: PageProps) {
  const { id } = await params;
  const [user, roles] = await Promise.all([getUser(id), getRoles()]);
  if (!user) notFound();
  return <EditUserPageClient user={user} roles={roles} />;
}
