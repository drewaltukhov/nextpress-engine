"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Network,
  Pencil,
  Search,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Sliders,
  Undo2,
  X,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { FormattedDate } from "@core/components/FormattedDate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@core/components/ConfirmDialog";
import type { PageListItem, AuthorSummary, PageStatus, PageView } from "@core-plugins/pages";
import {
  deletePageAction,
  duplicatePageAction,
  forceDeletePageAction,
  getPagesList,
  restorePageAction,
  setPageStatusAction,
  type PagesPermissions,
} from "./actions";
import { SeoEditDialog } from "./SeoEditDialog";
import { BacklinksDialog } from "@core/components/BacklinksDialog";

type BacklinksTarget = { kind: "page"; id: number; title: string };

interface Props {
  permissions: PagesPermissions;
  initial: PageListItem[];
  authors: AuthorSummary[];
  /** Custom Single Page templates pulled from the active theme. */
  pageTemplates: { slug: string; displayName: string }[];
}

type StatusFilter = PageStatus | "all";

interface FilterState {
  search: string;
  status: StatusFilter;
  authorId: string;       // empty = all
  dateFrom: string;       // empty = none
  dateTo: string;
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  draft: "Draft",
  published: "Published",
};

const initialFilters: FilterState = {
  search: "",
  status: "all",
  authorId: "",
  dateFrom: "",
  dateTo: "",
};

export function PagesPageClient({ permissions, initial, authors, pageTemplates }: Props) {
  const templateLabel = useMemo(
    () => new Map(pageTemplates.map((t) => [t.slug, t.displayName])),
    [pageTemplates],
  );
  const [view, setView] = useState<PageView>("live");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [rows, setRows] = useState<PageListItem[]>(initial);
  const [, startTransition] = useTransition();
  const [seoEditingId, setSeoEditingId] = useState<number | null>(null);
  const [backlinksTarget, setBacklinksTarget] = useState<BacklinksTarget | null>(null);

  const filtersDirty = useMemo(
    () =>
      filters.search !== "" ||
      filters.status !== "all" ||
      filters.authorId !== "" ||
      filters.dateFrom !== "" ||
      filters.dateTo !== "",
    [filters],
  );

  // Re-fetch whenever filters or the live/trash view change. Debounce
  // search by 300ms; everything else fires immediately. The cancellation
  // flag prevents a stale request from an earlier state from clobbering
  // a newer one.
  useEffect(() => {
    const debounceMs = filters.search ? 300 : 0;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const next = await getPagesList({
          search: filters.search || undefined,
          // Status filter is meaningless in trash view — trashed rows
          // can be either draft or published; the user just wants to
          // see the trashed bucket.
          status: view === "trash" || filters.status === "all" ? undefined : filters.status,
          authorId: filters.authorId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          view,
        });
        if (!cancelled) setRows(next);
      });
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [filters, view]);

  function clearFilters() {
    setFilters(initialFilters);
  }

  function refresh() {
    // Force the fetch effect to re-run by toggling the filters object
    // identity (the underlying values stay the same).
    setFilters((f) => ({ ...f }));
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Pages</h1>
          <p className="mt-1 text-sm text-slate-500">
            Standalone pages — about, contact, landing pages, anything that lives outside your blog.
          </p>
        </div>
        <Link
          href="/admin/pages/new"
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Add page
        </Link>
      </div>

      <ViewSwitcher view={view} onChange={setView} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        showAuthor={permissions.canSeeAll}
        authors={authors}
        dirty={filtersDirty}
        onClear={clearFilters}
        view={view}
      />

      {rows.length === 0 ? (
        <EmptyState filtersDirty={filtersDirty} view={view} />
      ) : (
        <PagesTable
          rows={rows}
          permissions={permissions}
          view={view}
          templateLabel={templateLabel}
          onEditSeo={(id) => setSeoEditingId(id)}
          onShowBacklinks={(target) => setBacklinksTarget(target)}
          onAfterMutation={refresh}
        />
      )}

      <SeoEditDialog
        pageId={seoEditingId}
        onClose={() => setSeoEditingId(null)}
      />

      <BacklinksDialog
        open={backlinksTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBacklinksTarget(null);
        }}
        target={backlinksTarget}
      />
    </div>
  );
}

interface ViewSwitcherProps {
  view: PageView;
  onChange: (next: PageView) => void;
}

function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
      active
        ? "bg-white text-brand-navy shadow-sm border border-slate-200"
        : "text-slate-500 hover:text-slate-900"
    }`;
  return (
    <div className="mb-3 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      <button type="button" onClick={() => onChange("live")} className={tabClass(view === "live")}>
        Live
      </button>
      <button type="button" onClick={() => onChange("trash")} className={tabClass(view === "trash")}>
        <Trash2 className="size-3.5" />
        Trash
      </button>
    </div>
  );
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  showAuthor: boolean;
  authors: AuthorSummary[];
  dirty: boolean;
  onClear: () => void;
  view: PageView;
}

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

function FilterBar({ filters, onChange, showAuthor, authors, dirty, onClear, view }: FilterBarProps) {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-4">
          <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Title, SEO title, or description"
              className={`${inputCls} w-full pl-8`}
            />
          </div>
        </div>

        {view === "live" && (
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <Select
              value={filters.status}
              onValueChange={(v) => onChange({ ...filters, status: v as StatusFilter })}
            >
              <SelectTrigger className="w-full">
                {/* base-ui's SelectValue defaults to the raw value string;
                    map id → label so the trigger reads "Draft" instead of
                    "draft". */}
                <SelectValue>
                  {(value: string) => STATUS_FILTER_LABELS[value as StatusFilter] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showAuthor && (
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Author</label>
            <Select
              value={filters.authorId || "all"}
              onValueChange={(v) => {
                const next = !v || v === "all" ? "" : v;
                onChange({ ...filters, authorId: next });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) => {
                    if (value === "all") return "All authors";
                    const a = authors.find((opt) => opt.id === value);
                    return a ? a.displayName : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All authors</SelectItem>
                {authors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={showAuthor ? "lg:col-span-2" : "lg:col-span-3"}>
          <label className="block text-xs font-medium text-slate-500 mb-1">Updated from</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
        <div className={showAuthor ? "lg:col-span-2" : "lg:col-span-3"}>
          <label className="block text-xs font-medium text-slate-500 mb-1">Updated to</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      {dirty && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X className="size-3.5" />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ filtersDirty, view }: { filtersDirty: boolean; view: PageView }) {
  if (filtersDirty) {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
        <p className="text-sm text-slate-500">No pages match these filters.</p>
      </div>
    );
  }
  if (view === "trash") {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
        <p className="text-sm font-medium text-slate-900">Trash is empty</p>
        <p className="mt-1 text-sm text-slate-500">
          Trashed pages stay here for 30 days before being permanently deleted.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm font-medium text-slate-900">No pages yet</p>
      <p className="mt-1 text-sm text-slate-500">Create your first page to get started.</p>
      <Link
        href="/admin/pages/new"
        className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Add your first page
      </Link>
    </div>
  );
}

interface PagesTableProps {
  rows: PageListItem[];
  permissions: PagesPermissions;
  view: PageView;
  templateLabel: Map<string, string>;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
}

function PagesTable({ rows, permissions, view, templateLabel, onEditSeo, onShowBacklinks, onAfterMutation }: PagesTableProps) {
  const isTrash = view === "trash";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50">
            <th className="text-left font-medium text-slate-500 px-4 py-3">Title</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Slug</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3">Author</th>
            <th className="text-left font-medium text-slate-500 px-4 py-3 w-40">Template</th>
            {!isTrash && (
              <th className="text-left font-medium text-slate-500 px-4 py-3 w-28">Status</th>
            )}
            <th className="text-left font-medium text-slate-500 px-4 py-3 w-44">
              {isTrash ? "Trashed" : "Updated"}
            </th>
            <th className="text-right font-medium text-slate-500 px-4 py-3 w-44"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PageRow
              key={row.id}
              row={row}
              permissions={permissions}
              view={view}
              templateLabel={templateLabel}
              onEditSeo={onEditSeo}
              onShowBacklinks={onShowBacklinks}
              onAfterMutation={onAfterMutation}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PageRowProps {
  row: PageListItem;
  permissions: PagesPermissions;
  view: PageView;
  templateLabel: Map<string, string>;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
}

function PageRow({ row, permissions, view, templateLabel, onEditSeo, onShowBacklinks, onAfterMutation }: PageRowProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const editHref = `/admin/pages/${row.id}/edit`;
  const isTrash = view === "trash";

  // Edit gate: pages.new sees all; pages.draft-only sees only own.
  const canEdit = permissions.canSeeAll || (!!permissions.userId && row.createdBy === permissions.userId);

  async function handleToggleStatus() {
    const next: PageStatus = row.status === "published" ? "draft" : "published";
    const ok = await confirm({
      title: next === "published" ? "Publish this page?" : "Unpublish this page?",
      description:
        next === "published"
          ? `"${row.title}" will become visible at /${row.slug}.`
          : `"${row.title}" will be hidden from the public site and revert to draft.`,
      confirmLabel: next === "published" ? "Publish" : "Unpublish",
      danger: next === "draft",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await setPageStatusAction(row.id, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(next === "published" ? "Page published" : "Page unpublished");
      // `router.refresh()` re-runs the server component but the parent's
      // `useState(initial)` only initialises once, so the row's status
      // badge would stay stale until the next filter toggle. Match the
      // delete/restore handlers and call `onAfterMutation` instead — it
      // bumps the filters identity, which retriggers the fetch effect
      // and refreshes local `rows` state.
      onAfterMutation();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Move this page to trash?",
      description: `"${row.title}" will be moved to trash. You can restore it within 30 days; after that it's permanently deleted.`,
      confirmLabel: "Move to trash",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePageAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Page moved to trash");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicatePageAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Page duplicated");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleRestore() {
    startTransition(async () => {
      const result = await restorePageAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Page restored");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleForceDelete() {
    const ok = await confirm({
      title: "Permanently delete this page?",
      description: `"${row.title}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await forceDeletePageAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Page permanently deleted");
      onAfterMutation();
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        {canEdit && !isTrash ? (
          <Link href={editHref} className="font-medium text-slate-900 hover:text-brand-green transition-colors">
            {row.title}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{row.title}</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">/{row.slug}</td>
      <td className="px-4 py-3 text-slate-700">
        {row.authorDisplayName ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {row.template
          ? (templateLabel.get(row.template) ?? row.template)
          : <span className="text-slate-400">Default</span>}
      </td>
      {!isTrash && (
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
      )}
      <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">
        {isTrash && row.trashedAt ? <TrashedCell trashedAt={row.trashedAt} /> : <FormattedDate iso={row.updatedAt} />}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-0.5">
          {isTrash ? (
            permissions.canDelete && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleRestore}
                        disabled={pending}
                        aria-label={`Restore ${row.title}`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        <Undo2 className="size-4" />
                      </button>
                    }
                  />
                  <TooltipContent>Restore</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleForceDelete}
                        disabled={pending}
                        aria-label={`Permanently delete ${row.title}`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    }
                  />
                  <TooltipContent>Delete permanently</TooltipContent>
                </Tooltip>
              </>
            )
          ) : (
            <>
              {/* Open in a new tab — published only, since drafts 404
                  publicly. Anchored as an `<a>` so middle-click and
                  cmd-click behave naturally; rel covers the
                  `target="_blank"` security best-practice. */}
              {row.status === "published" && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        href={`/${row.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${row.title} in new tab`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    }
                  />
                  <TooltipContent>Open in new tab</TooltipContent>
                </Tooltip>
              )}
              {canEdit && (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={editHref}
                          aria-label={`Edit ${row.title}`}
                          className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil className="size-4" />
                        </Link>
                      }
                    />
                    <TooltipContent>Edit page</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onEditSeo(row.id)}
                          aria-label={`Edit SEO for ${row.title}`}
                          className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Sliders className="size-4" />
                        </button>
                      }
                    />
                    <TooltipContent>Quick SEO edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={handleDuplicate}
                          disabled={pending}
                          aria-label={`Duplicate ${row.title}`}
                          className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          <Copy className="size-4" />
                        </button>
                      }
                    />
                    <TooltipContent>Duplicate</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() =>
                        onShowBacklinks({ kind: "page", id: row.id, title: row.title })
                      }
                      aria-label={`Show backlinks for ${row.title}`}
                      className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                      <Network className="size-4" />
                    </button>
                  }
                />
                <TooltipContent>Show backlinks</TooltipContent>
              </Tooltip>
              {permissions.canPublish && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleToggleStatus}
                        disabled={pending}
                        aria-label={row.status === "published" ? `Unpublish ${row.title}` : `Publish ${row.title}`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        {row.status === "published" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  />
                  <TooltipContent>{row.status === "published" ? "Unpublish" : "Publish"}</TooltipContent>
                </Tooltip>
              )}
              {permissions.canDelete && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={pending}
                        aria-label={`Delete ${row.title}`}
                        className="inline-flex items-center justify-center size-8 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    }
                  />
                  <TooltipContent>Move to trash</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Trashed-at cell — shows date plus "X days left" countdown to purge. */
function TrashedCell({ trashedAt }: { trashedAt: string }) {
  const trashedDate = new Date(
    trashedAt.includes("T") ? trashedAt : trashedAt.replace(" ", "T") + "Z",
  );
  const purgeAt = new Date(trashedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return (
    <div className="flex flex-col">
      <FormattedDate iso={trashedAt} />
      <span className={`text-[10px] ${daysLeft <= 3 ? "text-rose-600" : "text-slate-400"}`}>
        {daysLeft === 0 ? "Purging soon" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: PageStatus }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Published
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      Draft
    </span>
  );
}

