"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@core/components/ConfirmDialog";
import { FormattedDate } from "@core/components/FormattedDate";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MenuListItem } from "@core-plugins/menus";
import { createMenuAction, deleteMenuAction } from "./actions";

interface Props {
  initial: MenuListItem[];
}

export function MenusPageClient({ initial }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  function handleDelete(menu: MenuListItem) {
    void (async () => {
      const ok = await confirm({
        title: `Delete menu "${menu.name}"?`,
        description: "This deletes the menu and all of its items. Cannot be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const r = await deleteMenuAction(menu.id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Menu deleted");
        router.refresh();
      });
    })();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Menus</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build the navigation links your visitors see — header, footer, sidebars. Assign each menu to a spot, and your theme uses it automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Add menu
        </button>
      </div>

      {initial.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <MenusTable rows={initial} onDelete={handleDelete} pending={pending} />
      )}

      <CreateMenuDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <ListOrdered className="mx-auto mb-3 size-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-900">No menus yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Create your first menu and assign it to a spot &mdash; like the header or footer &mdash; and your theme will display it.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Add menu
      </button>
    </div>
  );
}

function MenusTable({
  rows,
  onDelete,
  pending,
}: {
  rows: MenuListItem[];
  onDelete: (m: MenuListItem) => void;
  pending: boolean;
}) {
  // System menus are detected by LOCATION ('primary' / 'footer') —
  // that's the contract the theme uses to look them up. Slugs were
  // auto-derived from names historically (e.g. "Main Menu" →
  // "main-menu"), so slug-based detection misses pre-existing menus.
  // Pinning order: primary first → footer second → everything else
  // stays in the server's name-sorted order (stable sort).
  const systemPriority = (location: string | null) =>
    location === "primary" ? 0 : location === "footer" ? 1 : 2;
  const sortedRows = [...rows].sort(
    (a, b) => systemPriority(a.location) - systemPriority(b.location),
  );
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Items</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedRows.map((row) => {
            const isSystem = row.location === "primary" || row.location === "footer";
            return (
            <tr
              key={row.id}
              className={
                isSystem
                  ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                  : "hover:bg-slate-50/50"
              }
            >
              <td className="px-4 py-3 font-medium text-slate-900">
                <Link href={`/admin/menus/${row.id}/edit`} className="hover:text-brand-green">
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.slug}</td>
              <td className="px-4 py-3 text-slate-600">
                {row.location ? (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{row.location}</code>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600 tabular-nums">{row.itemCount}</td>
              <td className="px-4 py-3 text-slate-500 tabular-nums">
                <FormattedDate iso={row.updatedAt} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={`/admin/menus/${row.id}/edit`}
                          aria-label={`Edit ${row.name}`}
                          className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil className="size-4" />
                        </Link>
                      }
                    />
                    <TooltipContent>Edit menu</TooltipContent>
                  </Tooltip>
                  {/* "primary" and "footer" are reserved system menus —
                      themes look them up by location and can't render
                      without them. The icon stays in place but is shaded
                      + disabled (with a tooltip explaining why) so the
                      row's action column doesn't shift width across
                      system vs user menus. The server action enforces
                      the same rule. */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          disabled={pending || isSystem}
                          onClick={() => !isSystem && onDelete(row)}
                          aria-label={
                            isSystem
                              ? `${row.name} is a reserved system menu and can't be deleted`
                              : `Delete ${row.name}`
                          }
                          className={
                            isSystem
                              ? "inline-flex items-center justify-center size-8 rounded-md text-slate-300 cursor-not-allowed"
                              : "inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      }
                    />
                    <TooltipContent>
                      {isSystem ? "Reserved system menu — can't be deleted" : "Delete menu"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateMenuDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) {
      toast.error("Menu name is required");
      return;
    }
    startTransition(async () => {
      // Slug is auto-derived from the name; location stays null until
      // the editor opts in. The two reserved system menus ("primary",
      // "footer") are seeded by setup and protected from deletion.
      const r = await createMenuAction({ name });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Menu created");
      onOpenChange(false);
      if (r.id != null) router.push(`/admin/menus/${r.id}/edit`);
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-brand-navy">New menu</h2>
        <div className="space-y-3">
          <Field
            name="name"
            label="Name"
            placeholder="Resources"
            hint="Use the Nav Menu block in your theme to render this menu wherever you like."
            required
            autoFocus
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-brand-green px-5 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
  autoFocus,
  hint,
  mono,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <input
        type="text"
        name={name}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition ${
          mono ? "font-mono" : ""
        }`}
      />
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}
