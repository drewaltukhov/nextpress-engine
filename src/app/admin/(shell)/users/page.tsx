import type { Metadata } from "next";
import { auth } from "@core/auth";
import { getUsers } from "./actions";
import { UsersPageClient } from "./UsersPageClient";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const [users, session] = await Promise.all([getUsers(), auth()]);
  return (
    <UsersPageClient
      users={users}
      currentUserId={session?.user?.id ?? null}
    />
  );
}
