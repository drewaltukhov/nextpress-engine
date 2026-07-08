"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { KeyRound, Mail, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { UserAvatar } from "@core/components/UserAvatar";
import { toggleUserStatus, type UserListItem } from "./actions";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  editor: "bg-blue-100 text-blue-700",
  author: "bg-amber-100 text-amber-700",
  contributor: "bg-slate-100 text-slate-600",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium ${
        ROLE_COLORS[role] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatusToggle({ user, isSelf }: { user: UserListItem; isSelf: boolean }) {
  const [checked, setChecked] = useState(user.status === "active");
  const [pending, startTransition] = useTransition();

  function handleToggle(newChecked: boolean) {
    const newStatus = newChecked ? "active" : "disabled";
    setChecked(newChecked);
    startTransition(async () => {
      const result = await toggleUserStatus(user.id, newStatus);
      if (!result.ok) {
        setChecked(!newChecked); // revert
        toast.error(result.error);
      } else {
        toast.success(`${user.displayName} ${newStatus === "active" ? "enabled" : "disabled"}`);
      }
    });
  }

  if (isSelf) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-block">
              <Switch checked disabled onCheckedChange={() => {}} />
            </span>
          }
        />
        <TooltipContent>You can&apos;t disable your own account</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={handleToggle}
      disabled={pending}
    />
  );
}

const iconBtnCls =
  "inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors";

interface UserTableProps {
  users: UserListItem[];
  currentUserId: string | null;
}

export function UserTable({ users, currentUserId }: UserTableProps) {
  const [resetting, setResetting] = useState<UserListItem | null>(null);
  const [changingEmail, setChangingEmail] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState<UserListItem | null>(null);

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No users found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            <th className="text-left font-medium text-slate-500 px-4 py-3">User</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Role</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Last login</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Joined</th>
            <th className="text-center font-medium text-slate-500 px-4 py-3">Active</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={user.displayName}
                    email={user.email}
                    url={user.avatarUrl}
                    size={32}
                    className="text-sm"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{user.displayName}</div>
                    <div className="text-sm text-slate-500 truncate">{user.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <RoleBadge key={role} role={role} />
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-500">{formatDate(user.lastLoginAt)}</td>
              <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
              <td className="px-4 py-3 text-center">
                <StatusToggle user={user} isSelf={user.id === currentUserId} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={`/admin/users/${user.id}/edit`}
                          aria-label={`Edit ${user.displayName}`}
                          className={iconBtnCls}
                        >
                          <Pencil className="size-4" />
                        </Link>
                      }
                    />
                    <TooltipContent>Edit user</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => setChangingEmail(user)}
                          aria-label={`Change email for ${user.displayName}`}
                          className={iconBtnCls}
                        >
                          <Mail className="size-4" />
                        </button>
                      }
                    />
                    <TooltipContent>Change email</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => setResetting(user)}
                          aria-label={`Reset password for ${user.displayName}`}
                          className={iconBtnCls}
                        >
                          <KeyRound className="size-4" />
                        </button>
                      }
                    />
                    <TooltipContent>Reset password</TooltipContent>
                  </Tooltip>

                  {(() => {
                    // Self-delete stays blocked (a guard the dialog can't
                    // unwind). Admin targets are now allowed but the
                    // dialog asks for the actor's password as a step-up;
                    // last-admin and wrong-password are caught server-side.
                    const isSelf = user.id === currentUserId;
                    const isAdminRow = user.roles.includes("admin");
                    const tooltip = isSelf
                      ? "You can't delete your own account"
                      : isAdminRow
                        ? "Delete admin (password required)"
                        : "Delete user";
                    return (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={isSelf ? undefined : () => setDeleting(user)}
                              disabled={isSelf}
                              aria-label={`Delete ${user.displayName}`}
                              className={
                                isSelf
                                  ? "inline-flex items-center justify-center size-8 rounded-md text-slate-300 cursor-not-allowed"
                                  : "inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                              }
                            >
                              <Trash2 className="size-4" />
                            </button>
                          }
                        />
                        <TooltipContent>{tooltip}</TooltipContent>
                      </Tooltip>
                    );
                  })()}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ResetPasswordDialog
        user={resetting}
        open={resetting !== null}
        onOpenChange={(open) => {
          if (!open) setResetting(null);
        }}
        onSwitchToChangeEmail={(u) => {
          setResetting(null);
          setChangingEmail(u);
        }}
      />
      <ChangeEmailDialog
        user={changingEmail}
        open={changingEmail !== null}
        onOpenChange={(open) => {
          if (!open) setChangingEmail(null);
        }}
      />
      <DeleteUserDialog
        user={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </div>
  );
}
