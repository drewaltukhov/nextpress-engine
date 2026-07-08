"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { UserTable } from "./UserTable";
import type { UserListItem } from "./actions";

interface Props {
  users: UserListItem[];
  currentUserId: string | null;
}

export function UsersPageClient({ users, currentUserId }: Props) {
  return (
    <div>
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage user accounts, roles, and access.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="h-10 inline-flex items-center gap-1.5 px-4 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" /> Add user
        </Link>
      </div>

      <UserTable users={users} currentUserId={currentUserId} />
    </div>
  );
}
