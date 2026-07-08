"use client";

import { ShieldCheck, Plus } from "lucide-react";
import { AdminSection } from "@core/components/AdminSection";
import { RoleTable } from "./RoleTable";
import { AddRoleForm } from "./AddRoleForm";
import type { RoleRow } from "./actions";

interface Props {
  roles: RoleRow[];
}

export function RolesPageClient({ roles }: Props) {
  return (
    <AdminSection
      title="Roles"
      description="Define what each role can do. Built-in roles can't be edited; add your own for more control."
      tabs={[
        {
          value: "manage",
          label: "Manage",
          icon: <ShieldCheck className="size-4" />,
          content: <RoleTable roles={roles} />,
        },
        {
          value: "add",
          label: "Add role",
          icon: <Plus className="size-4" />,
          content: <AddRoleForm />,
        },
      ]}
    />
  );
}
