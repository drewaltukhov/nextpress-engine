"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import type { TopicListItem } from "@core-plugins/topics";
import { TopicDialog, type CustomTopicTemplate } from "./TopicDialog";
import { deleteTopicAction } from "./actions";

interface Props {
  initial: TopicListItem[];
  customTopicTemplates: CustomTopicTemplate[];
}

export function TopicsPageClient({ initial, customTopicTemplates }: Props) {
  // Display-name lookup so the table can show "Long Form" instead of the
  // raw slug. Falls back to the slug if a topic references a template
  // that was deleted from the active theme.
  const templateLabel = new Map(
    customTopicTemplates.map((t) => [t.slug, t.displayName]),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TopicListItem | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // `?new=1` query flag = "+ New → Topic" was clicked from the topbar.
  // Auto-open the Add dialog and strip the param so a refresh doesn't
  // re-open it. Replaces history rather than pushing so the back button
  // doesn't bounce through the parameterised URL.
  //
  // The setState calls violate `react-hooks/set-state-in-effect`, but
  // this effect has a genuine non-state side effect (`router.replace`)
  // that has to fire alongside, so we can't move it to a derived-render
  // pattern. Disabling the rule for this single case is preferable to
  // splitting the trigger across two surfaces.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditing(null);
    setDialogOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("new");
    const qs = next.toString();
    router.replace(qs ? `/admin/topics?${qs}` : "/admin/topics");
  }, [searchParams, router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(topic: TopicListItem) {
    setEditing(topic);
    setDialogOpen(true);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Topics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tags for grouping related posts. Pick one or more when writing a post to help readers browse by subject.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Add topic
        </button>
      </div>

      {initial.length === 0 ? (
        <EmptyState onCreate={openAdd} />
      ) : (
        <TopicsTable rows={initial} templateLabel={templateLabel} onEdit={openEdit} />
      )}

      <TopicDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        topic={editing}
        customTopicTemplates={customTopicTemplates}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm text-slate-500">No topics yet. Create one to start tagging content.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Add your first topic
      </button>
    </div>
  );
}

interface TableProps {
  rows: TopicListItem[];
  templateLabel: Map<string, string>;
  onEdit: (topic: TopicListItem) => void;
}

function TopicsTable({ rows, templateLabel, onEdit }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            <th className="text-left font-medium text-slate-500 px-4 py-3">Name</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Slug</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Description</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Template</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3">Posts</th>
            <th className="text-right font-medium text-slate-500 px-4 py-3 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TopicRow
              key={row.id}
              row={row}
              templateLabel={templateLabel}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicRow({
  row,
  templateLabel,
  onEdit,
}: {
  row: TopicListItem;
  templateLabel: Map<string, string>;
  onEdit: (t: TopicListItem) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete topic?",
      description:
        row.postCount > 0
          ? `"${row.name}" is used on ${row.postCount} ${row.postCount === 1 ? "post" : "posts"}. Those posts will lose this tag. Delete anyway?`
          : `"${row.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTopicAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Topic deleted");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">/topics/{row.slug}</td>
      <td className="px-4 py-3 text-slate-600 max-w-md truncate">
        {row.description || <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {row.template
          ? (templateLabel.get(row.template) ?? row.template)
          : <span className="text-slate-400">Default</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {row.postCount > 0 ? row.postCount.toLocaleString() : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  disabled={pending}
                  aria-label={`Edit ${row.name}`}
                  className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <Pencil className="size-4" />
                </button>
              }
            />
            <TooltipContent>Edit topic</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  aria-label={`Delete ${row.name}`}
                  className="inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              }
            />
            <TooltipContent>Delete topic</TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}
