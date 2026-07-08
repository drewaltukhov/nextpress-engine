"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  ChevronRight,
  ChevronDown,
  Layers,
  GitBranch,
  FileText,
  Tag,
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
import type {
  PostListItem,
  AuthorSummary,
  PillarOption,
  PostStatus,
  PostKind,
  PostView,
} from "@core-plugins/posts";
import type { TopicListItem } from "@core-plugins/topics";
import {
  deletePostAction,
  duplicatePostAction,
  forceDeletePostAction,
  getPostsList,
  restorePostAction,
  setPostStatusAction,
  type PostsPermissions,
  type PostsListBundle,
} from "./actions";
import { SeoEditDialog } from "./SeoEditDialog";
import { BacklinksDialog } from "@core/components/BacklinksDialog";

type BacklinksTarget = { kind: "post"; id: number; title: string };

/**
 * Lookup maps for the Template column in the posts table. Posts/pillars/
 * spikes are wrapped in nested components (TreeTable → PillarRowGroup →
 * PostRow, FlatTable → FlatBody → PostRow), so threading the maps as
 * props would noise up six layers. PostRow consumes this directly.
 */
const TemplateLabelContext = createContext<{
  post: Map<string, string>;
  pillar: Map<string, string>;
}>({ post: new Map(), pillar: new Map() });

interface Props {
  permissions: PostsPermissions;
  initial: PostsListBundle;
  authors: AuthorSummary[];
  pillars: PillarOption[];
  topics: TopicListItem[];
  /** Custom Single Post templates from the active theme (standalone + spike). */
  postTemplates: { slug: string; displayName: string }[];
  /** Custom Pillar Post templates from the active theme (pillar kind). */
  pillarTemplates: { slug: string; displayName: string }[];
}

type StatusFilter = PostStatus | "all";
type KindFilter = PostKind | "all";

interface FilterState {
  search: string;
  status: StatusFilter;
  kind: KindFilter;
  /** Empty string = no scope; "<id>" = restrict to that pillar's spikes. */
  pillarId: string;
  /** Empty array = no scope; non-empty = OR over these topic ids. */
  topicIds: number[];
  authorId: string;
  dateFrom: string;
  dateTo: string;
}

const KIND_FILTER_LABELS: Record<KindFilter, string> = {
  all: "All kinds",
  pillar: "Pillars",
  spike: "Spikes",
  standalone: "Standalone",
};

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  draft: "Draft",
  published: "Published",
};

const initialFilters: FilterState = {
  search: "",
  status: "all",
  kind: "all",
  pillarId: "",
  topicIds: [],
  authorId: "",
  dateFrom: "",
  dateTo: "",
};

export function PostsPageClient({
  permissions,
  initial,
  authors,
  pillars,
  topics,
  postTemplates,
  pillarTemplates,
}: Props) {
  // createCustomTemplate dedup is scoped per (theme, parent), so a
  // single-post-parent and a single-pillar-parent custom can share the
  // same slug. Keep separate label maps and pick the right one in the
  // row by `postKind`.
  const postTemplateLabel = useMemo(
    () => new Map(postTemplates.map((t) => [t.slug, t.displayName])),
    [postTemplates],
  );
  const pillarTemplateLabel = useMemo(
    () => new Map(pillarTemplates.map((t) => [t.slug, t.displayName])),
    [pillarTemplates],
  );
  const [view, setView] = useState<PostView>("live");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [bundle, setBundle] = useState<PostsListBundle>(initial);
  const [, startTransition] = useTransition();
  const [seoEditingId, setSeoEditingId] = useState<number | null>(null);
  const [backlinksTarget, setBacklinksTarget] = useState<BacklinksTarget | null>(null);

  const filtersDirty = useMemo(
    () =>
      filters.search !== "" ||
      filters.status !== "all" ||
      filters.kind !== "all" ||
      filters.pillarId !== "" ||
      filters.topicIds.length > 0 ||
      filters.authorId !== "" ||
      filters.dateFrom !== "" ||
      filters.dateTo !== "",
    [filters],
  );

  // Refetch on any filter / view change. Search is debounced 300ms; the
  // rest fire immediately. Cancellation flag guards against a stale
  // response clobbering a newer one.
  useEffect(() => {
    const debounceMs = filters.search ? 300 : 0;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const next = await getPostsList({
          search: filters.search || undefined,
          status: view === "trash" || filters.status === "all" ? undefined : filters.status,
          kind: filters.kind === "all" ? undefined : filters.kind,
          pillarId: filters.pillarId ? Number(filters.pillarId) : undefined,
          topicIds: filters.topicIds.length > 0 ? filters.topicIds : undefined,
          authorId: filters.authorId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          view,
        });
        if (!cancelled) setBundle(next);
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
    setFilters((f) => ({ ...f }));
  }

  // Tree mode kicks in when nothing is narrowing the result. Picking any
  // kind / pillar / status / author / date filter (or trash view) flattens
  // back to a plain table — at that point the user is searching, not
  // browsing the hierarchy.
  const useTreeView =
    view === "live" &&
    !filters.search &&
    filters.kind === "all" &&
    !filters.pillarId &&
    filters.topicIds.length === 0 &&
    filters.status === "all" &&
    !filters.authorId &&
    !filters.dateFrom &&
    !filters.dateTo;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Posts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your blog. Pillars are big-picture topic pages; Spikes are focused
            articles tied to a Pillar.
          </p>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
        >
          <Plus className="size-4" />
          Add post
        </Link>
      </div>

      <ViewSwitcher view={view} onChange={setView} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        showAuthor={permissions.canSeeAll}
        authors={authors}
        pillars={pillars}
        topics={topics}
        dirty={filtersDirty}
        onClear={clearFilters}
        view={view}
      />

      {bundle.rows.length === 0 ? (
        <EmptyState filtersDirty={filtersDirty} view={view} />
      ) : (
        <TemplateLabelContext.Provider
          value={{ post: postTemplateLabel, pillar: pillarTemplateLabel }}
        >
          {useTreeView ? (
            <PostsTreeTable
              bundle={bundle}
              permissions={permissions}
              view={view}
              onEditSeo={(id) => setSeoEditingId(id)}
              onShowBacklinks={(target) => setBacklinksTarget(target)}
              onAfterMutation={refresh}
            />
          ) : (
            <PostsFlatTable
              bundle={bundle}
              permissions={permissions}
              view={view}
              onEditSeo={(id) => setSeoEditingId(id)}
              onShowBacklinks={(target) => setBacklinksTarget(target)}
              onAfterMutation={refresh}
            />
          )}
        </TemplateLabelContext.Provider>
      )}

      <SeoEditDialog
        postId={seoEditingId}
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
  view: PostView;
  onChange: (next: PostView) => void;
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
  pillars: PillarOption[];
  topics: TopicListItem[];
  dirty: boolean;
  onClear: () => void;
  view: PostView;
}

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

function FilterBar({ filters, onChange, showAuthor, authors, pillars, topics, dirty, onClear, view }: FilterBarProps) {
  // Layout:
  //   Row 1 (12-col grid): Search 50% + Updated from 25% + Updated to 25%.
  //   Row 2 (flex with flex-1 children): every selector filter shares the
  //     remaining width evenly, regardless of which conditional ones
  //     render. flex auto-distributes 5 / 4 / 3 cells uniformly — a
  //     fixed grid would leave dead columns when Status (trash view)
  //     or Author (non-admin) drop out. min-w prevents the trigger
  //     buttons from squishing too narrow on tablet widths; below it
  //     they wrap.
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-6">
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
        <div className="lg:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Updated from</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
        <div className="lg:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Updated to</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Kind</label>
          <Select
            value={filters.kind}
            onValueChange={(v) => onChange({ ...filters, kind: v as KindFilter })}
          >
            <SelectTrigger className="w-full">
              {/* base-ui's SelectValue defaults to the raw value string;
                  pass a function child to map the underlying id to its
                  display label so the trigger reads "Pillars" instead of
                  "pillar". Same pattern used elsewhere in the admin. */}
              <SelectValue>
                {(value: string) => KIND_FILTER_LABELS[value as KindFilter] ?? value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="pillar">Pillars</SelectItem>
              <SelectItem value="spike">Spikes</SelectItem>
              <SelectItem value="standalone">Standalone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Pillar</label>
          <Select
            value={filters.pillarId || "all"}
            onValueChange={(v) => {
              const next = !v || v === "all" ? "" : v;
              onChange({ ...filters, pillarId: next });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string) => {
                  if (value === "all") return "Any pillar";
                  const p = pillars.find((opt) => String(opt.id) === value);
                  return p ? p.title : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any pillar</SelectItem>
              {pillars.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Topics</label>
          <TopicsMultiSelect
            topics={topics}
            value={filters.topicIds}
            onChange={(next) => onChange({ ...filters, topicIds: next })}
          />
        </div>

        {view === "live" && (
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <Select
              value={filters.status}
              onValueChange={(v) => onChange({ ...filters, status: v as StatusFilter })}
            >
              <SelectTrigger className="w-full">
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
          <div className="flex-1 min-w-[160px]">
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

// ---------------------------------------------------------------------------
// Topics multi-select dropdown
// ---------------------------------------------------------------------------
//
// Self-contained popover with checkbox rows. The project doesn't ship a
// generic Popover primitive, so we roll a small button + absolute panel
// + outside-click handler — same shape as native <select> for keyboard
// users (button focusable, opens on click/Enter, ESC closes).
//
// Search-as-you-type filters the list; the selected pills stay visible
// inside the trigger up to a small cap, then collapse to "+N".

interface TopicsMultiSelectProps {
  topics: TopicListItem[];
  value: number[];
  onChange: (next: number[]) => void;
}

function TopicsMultiSelect({ topics, value, onChange }: TopicsMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(value), [value]);

  // Close on outside click + ESC. Both listeners only attach while the
  // panel is open so we don't pay the price on every keystroke.
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return topics;
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term),
    );
  }, [topics, search]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function clearAll() {
    onChange([]);
  }

  // Trigger label: 0 = "Any topic", 1 = the name, 2+ = "<n> topics".
  // A single highlighted name is more useful than a generic count when
  // only one is picked — most filter sessions touch one or two topics.
  let triggerLabel: React.ReactNode;
  if (value.length === 0) {
    triggerLabel = <span className="text-slate-500">Any topic</span>;
  } else if (value.length === 1) {
    const t = topics.find((opt) => opt.id === value[0]);
    triggerLabel = t ? t.name : `${value.length} topic`;
  } else {
    triggerLabel = `${value.length} topics`;
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="size-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics"
              autoFocus
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto py-1">
            {topics.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500 text-center">
                No topics yet.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">No matches</p>
            ) : (
              filtered.map((t) => {
                const isSelected = selected.has(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(t.id)}
                      className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                    />
                    <span className="flex-1 text-sm text-slate-900 truncate">
                      {t.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {t.postCount}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {value.length > 0 && (
            <div className="border-t border-slate-100 px-2 py-1.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {value.length} selected
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-slate-500 hover:text-slate-900 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ filtersDirty, view }: { filtersDirty: boolean; view: PostView }) {
  if (filtersDirty) {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
        <p className="text-sm text-slate-500">No posts match these filters.</p>
      </div>
    );
  }
  if (view === "trash") {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
        <p className="text-sm font-medium text-slate-900">Trash is empty</p>
        <p className="mt-1 text-sm text-slate-500">
          Trashed posts stay here for 30 days before being permanently deleted.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
      <p className="text-sm font-medium text-slate-900">No posts yet</p>
      <p className="mt-1 text-sm text-slate-500">
        Create a pillar to anchor a topic, or a standalone post for one-off content.
      </p>
      <Link
        href="/admin/posts/new"
        className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90"
      >
        <Plus className="size-4" />
        Add your first post
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree view (pillars + nested spikes; standalone in their own group)
// ---------------------------------------------------------------------------

interface TableProps {
  bundle: PostsListBundle;
  permissions: PostsPermissions;
  view: PostView;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
}

function PostsTreeTable({ bundle, permissions, view, onEditSeo, onShowBacklinks, onAfterMutation }: TableProps) {
  // Group rows: pillars at the top, with their spike children. Standalone
  // in their own group below. Spike-without-pillar (orphaned because the
  // pillar was trashed) lands in standalone so it stays editable.
  const pillars = bundle.rows.filter((r) => r.postKind === "pillar");
  const standalone = bundle.rows.filter((r) => r.postKind === "standalone");
  const orphanSpikes = bundle.rows.filter(
    (r) => r.postKind === "spike" && !pillars.some((p) => p.id === r.parentId),
  );
  const childMap = new Map<number, PostListItem[]>();
  for (const r of bundle.rows) {
    if (r.postKind === "spike" && r.parentId !== null) {
      const arr = childMap.get(r.parentId);
      if (arr) arr.push(r);
      else childMap.set(r.parentId, [r]);
    }
  }

  return (
    <div className="space-y-6">
      {pillars.length > 0 && (
        <GroupSection
          icon={<Layers className="size-4 text-brand-navy" />}
          title="Pillars"
          count={pillars.length}
        >
          <PillarTreeTable
            pillars={pillars}
            childMap={childMap}
            bundle={bundle}
            permissions={permissions}
            view={view}
            onEditSeo={onEditSeo}
            onShowBacklinks={onShowBacklinks}
            onAfterMutation={onAfterMutation}
          />
        </GroupSection>
      )}

      {standalone.length > 0 && (
        <GroupSection
          icon={<FileText className="size-4 text-brand-navy" />}
          title="Standalone"
          count={standalone.length}
        >
          <FlatBody
            rows={standalone}
            bundle={bundle}
            permissions={permissions}
            view={view}
            onEditSeo={onEditSeo}
            onShowBacklinks={onShowBacklinks}
            onAfterMutation={onAfterMutation}
          />
        </GroupSection>
      )}

      {orphanSpikes.length > 0 && (
        <GroupSection
          icon={<GitBranch className="size-4 text-amber-700" />}
          title="Orphaned spikes"
          count={orphanSpikes.length}
          subtitle="These spikes' parent pillars are missing. They won't render publicly until reassigned."
        >
          <FlatBody
            rows={orphanSpikes}
            bundle={bundle}
            permissions={permissions}
            view={view}
            onEditSeo={onEditSeo}
            onShowBacklinks={onShowBacklinks}
            onAfterMutation={onAfterMutation}
          />
        </GroupSection>
      )}
    </div>
  );
}

interface GroupSectionProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  subtitle?: string;
  children: React.ReactNode;
}

function GroupSection({ icon, title, count, subtitle, children }: GroupSectionProps) {
  return (
    <section>
      <header className="mb-2 flex items-baseline gap-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        </div>
        <span className="text-xs text-slate-400 tabular-nums">({count})</span>
        {subtitle && <span className="ml-2 text-xs text-slate-500">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

interface PillarTreeTableProps {
  pillars: PostListItem[];
  childMap: Map<number, PostListItem[]>;
  bundle: PostsListBundle;
  permissions: PostsPermissions;
  view: PostView;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
}

function PillarTreeTable({
  pillars,
  childMap,
  bundle,
  permissions,
  view,
  onEditSeo,
  onShowBacklinks,
  onAfterMutation,
}: PillarTreeTableProps) {
  // Track which pillars are expanded; default-collapsed because a long
  // editorial site can have lots of pillars and walking the page should
  // start short. Click the chevron (or pillar row) to expand.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <TableHead view={view} />
        <tbody>
          {pillars.map((p) => {
            const spikes = childMap.get(p.id) ?? [];
            const isOpen = expanded.has(p.id);
            return (
              <PillarRowGroup
                key={p.id}
                pillar={p}
                spikes={spikes}
                isOpen={isOpen}
                onToggle={() => toggle(p.id)}
                bundle={bundle}
                permissions={permissions}
                view={view}
                onEditSeo={onEditSeo}
                onShowBacklinks={onShowBacklinks}
                onAfterMutation={onAfterMutation}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PillarRowGroupProps {
  pillar: PostListItem;
  spikes: PostListItem[];
  isOpen: boolean;
  onToggle: () => void;
  bundle: PostsListBundle;
  permissions: PostsPermissions;
  view: PostView;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
}

function PillarRowGroup({
  pillar,
  spikes,
  isOpen,
  onToggle,
  bundle,
  permissions,
  view,
  onEditSeo,
  onShowBacklinks,
  onAfterMutation,
}: PillarRowGroupProps) {
  return (
    <>
      <PostRow
        row={pillar}
        bundle={bundle}
        permissions={permissions}
        view={view}
        onEditSeo={onEditSeo}
        onShowBacklinks={onShowBacklinks}
        onAfterMutation={onAfterMutation}
        toggle={
          spikes.length > 0
            ? { isOpen, onToggle, count: spikes.length }
            : undefined
        }
      />
      {isOpen &&
        spikes.map((c) => (
          <PostRow
            key={c.id}
            row={c}
            bundle={bundle}
            permissions={permissions}
            view={view}
            onEditSeo={onEditSeo}
            onShowBacklinks={onShowBacklinks}
            onAfterMutation={onAfterMutation}
            indent
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Flat view (used when any filter is set)
// ---------------------------------------------------------------------------

function PostsFlatTable({ bundle, permissions, view, onEditSeo, onShowBacklinks, onAfterMutation }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <TableHead view={view} />
        <FlatBody
          rows={bundle.rows}
          bundle={bundle}
          permissions={permissions}
          view={view}
          onEditSeo={onEditSeo}
          onShowBacklinks={onShowBacklinks}
          onAfterMutation={onAfterMutation}
          inlineTbody
        />
      </table>
    </div>
  );
}

interface FlatBodyProps {
  rows: PostListItem[];
  bundle: PostsListBundle;
  permissions: PostsPermissions;
  view: PostView;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
  /** When true, render <tbody> directly (used inside an existing <table>). */
  inlineTbody?: boolean;
}

function FlatBody({
  rows,
  bundle,
  permissions,
  view,
  onEditSeo,
  onShowBacklinks,
  onAfterMutation,
  inlineTbody,
}: FlatBodyProps) {
  const tbody = (
    <tbody>
      {rows.map((row) => (
        <PostRow
          key={row.id}
          row={row}
          bundle={bundle}
          permissions={permissions}
          view={view}
          onEditSeo={onEditSeo}
          onShowBacklinks={onShowBacklinks}
          onAfterMutation={onAfterMutation}
        />
      ))}
    </tbody>
  );
  if (inlineTbody) return tbody;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <TableHead view={view} />
        {tbody}
      </table>
    </div>
  );
}

function TableHead({ view }: { view: PostView }) {
  const isTrash = view === "trash";
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50/50">
        {/* w-14 (56px) – px-3 (24px) leaves a 32px content area so the
            size-8 FeaturedThumb / chevron renders at its natural square
            dimensions instead of being squished horizontally. */}
        <th className="text-left font-medium text-slate-500 px-3 py-3 w-14"></th>
        <th className="text-left font-medium text-slate-500 px-3 py-3 min-w-[320px]">Title</th>
        <th className="text-left font-medium text-slate-500 px-3 py-3 w-44">Topics</th>
        <th className="text-left font-medium text-slate-500 px-3 py-3 w-40">Author</th>
        <th className="text-left font-medium text-slate-500 px-3 py-3 w-36">Template</th>
        {!isTrash && (
          <th className="text-left font-medium text-slate-500 px-3 py-3 w-28">Status</th>
        )}
        <th className="text-left font-medium text-slate-500 px-3 py-3 w-40">
          {isTrash ? "Trashed" : "Updated"}
        </th>
        <th className="text-right font-medium text-slate-500 px-3 py-3 w-44"></th>
      </tr>
    </thead>
  );
}

interface PostRowProps {
  row: PostListItem;
  bundle: PostsListBundle;
  permissions: PostsPermissions;
  view: PostView;
  onEditSeo: (id: number) => void;
  onShowBacklinks: (target: BacklinksTarget) => void;
  onAfterMutation: () => void;
  /** Spike under a pillar in tree mode — bumps left padding. */
  indent?: boolean;
  /** Pillar with spikes — render an expand/collapse chevron + spike count. */
  toggle?: { isOpen: boolean; onToggle: () => void; count: number };
}

function PostRow({
  row,
  bundle,
  permissions,
  view,
  onEditSeo,
  onShowBacklinks,
  onAfterMutation,
  indent,
  toggle,
}: PostRowProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const editHref = `/admin/posts/${row.id}/edit`;
  const isTrash = view === "trash";

  const canEdit =
    permissions.canSeeAll || (!!permissions.userId && row.createdBy === permissions.userId);

  async function handleToggleStatus() {
    const next: PostStatus = row.status === "published" ? "draft" : "published";
    const ok = await confirm({
      title: next === "published" ? "Publish this post?" : "Unpublish this post?",
      description:
        next === "published"
          ? `"${row.title}" will become visible at ${publicUrlFor(row)}.`
          : `"${row.title}" will be hidden from the public site and revert to draft.`,
      confirmLabel: next === "published" ? "Publish" : "Unpublish",
      danger: next === "draft",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await setPostStatusAction(row.id, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(next === "published" ? "Post published" : "Post unpublished");
      onAfterMutation();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Move this post to trash?",
      description: `"${row.title}" will be moved to trash. You can restore it within 30 days; after that it's permanently deleted.`,
      confirmLabel: "Move to trash",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePostAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Post moved to trash");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicatePostAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Post duplicated");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleRestore() {
    startTransition(async () => {
      const result = await restorePostAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Post restored");
      onAfterMutation();
      router.refresh();
    });
  }

  async function handleForceDelete() {
    const ok = await confirm({
      title: "Permanently delete this post?",
      description: `"${row.title}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await forceDeletePostAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Post permanently deleted");
      onAfterMutation();
      router.refresh();
    });
  }

  const topicIds = bundle.topicsByPost[row.id] ?? [];

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-center">
          {toggle ? (
            <button
              type="button"
              onClick={toggle.onToggle}
              aria-label={toggle.isOpen ? "Collapse spikes" : "Expand spikes"}
              className="inline-flex items-center gap-1 size-6 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {toggle.isOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          ) : (
            <FeaturedThumb url={row.featuredImage} title={row.title} />
          )}
        </div>
      </td>
      <td className={`px-3 py-2.5 ${indent ? "pl-8" : ""}`}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {indent && <span className="text-slate-300 select-none">↳</span>}
            <KindIcon kind={row.postKind} />
            {canEdit && !isTrash ? (
              <Link
                href={editHref}
                className="font-medium text-slate-900 hover:text-brand-green transition-colors"
              >
                {row.title}
              </Link>
            ) : (
              <span className="font-medium text-slate-900">{row.title}</span>
            )}
            {toggle && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                {toggle.count} {toggle.count === 1 ? "spike" : "spikes"}
              </span>
            )}
          </div>
          <SlugLine row={row} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <TopicsCell topicIds={topicIds} catalog={bundle.topicCatalog} />
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {row.authorDisplayName ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-2.5 text-slate-600">
        <TemplateCell template={row.template} postKind={row.postKind} />
      </td>
      {!isTrash && (
        <td className="px-3 py-2.5">
          <StatusBadge status={row.status} />
        </td>
      )}
      <td className="px-3 py-2.5 text-slate-500 text-xs tabular-nums">
        {isTrash && row.trashedAt ? (
          <TrashedCell trashedAt={row.trashedAt} />
        ) : (
          <FormattedDate iso={row.updatedAt} />
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
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
              {/* Open in a new tab — published rows only (drafts 404 in
                  public). Orphaned spikes (parent pillar trashed) also
                  skip this button: their /<pillar>/<slug> URL would 404
                  too, so we don't surface a deceptive shortcut. */}
              {row.status === "published" &&
                !(row.postKind === "spike" && !row.parentSlug) && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        href={publicUrlFor(row)}
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
                    <TooltipContent>Edit post</TooltipContent>
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
                        onShowBacklinks({ kind: "post", id: row.id, title: row.title })
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
                        aria-label={
                          row.status === "published"
                            ? `Unpublish ${row.title}`
                            : `Publish ${row.title}`
                        }
                        className="inline-flex items-center justify-center size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        {row.status === "published" ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    }
                  />
                  <TooltipContent>
                    {row.status === "published" ? "Unpublish" : "Publish"}
                  </TooltipContent>
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

function FeaturedThumb({ url, title }: { url: string | null; title: string }) {
  // `shrink-0` is defensive — table cells can squeeze flex children when
  // the column gets too narrow. The cell width is sized to fit, but this
  // keeps the thumb true-square even if a future column tweak shrinks it.
  if (!url) {
    return <div className="size-8 rounded bg-slate-100 shrink-0" aria-hidden="true" />;
  }
  return (
    // Admin-only thumbnail; host-validation done at upload time, so the
    // next/image domain allowlist would force unnecessary config churn.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      title={title}
      className="size-8 shrink-0 rounded object-cover bg-slate-100"
      loading="lazy"
    />
  );
}

function KindIcon({ kind }: { kind: PostKind }) {
  if (kind === "pillar") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span aria-label="Pillar" className="inline-flex shrink-0 items-center justify-center size-5 rounded text-indigo-600">
              <Layers className="size-4" />
            </span>
          }
        />
        <TooltipContent>Pillar</TooltipContent>
      </Tooltip>
    );
  }
  if (kind === "spike") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span aria-label="Spike" className="inline-flex shrink-0 items-center justify-center size-5 rounded text-sky-600">
              <GitBranch className="size-4" />
            </span>
          }
        />
        <TooltipContent>Spike</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span aria-label="Standalone post" className="inline-flex shrink-0 items-center justify-center size-5 rounded text-slate-400">
            <FileText className="size-4" />
          </span>
        }
      />
      <TooltipContent>Standalone post</TooltipContent>
    </Tooltip>
  );
}

function SlugLine({ row }: { row: PostListItem }) {
  // Spikes show /<pillar>/<spike>; everything else shows /<slug>. Built
  // from the joined parent_slug so the table never renders a half-baked
  // path with a missing parent.
  const path =
    row.postKind === "spike" && row.parentSlug
      ? `/${row.parentSlug}/${row.slug}`
      : `/${row.slug}`;
  return <span className="font-mono text-[11px] text-slate-500">{path}</span>;
}

function publicUrlFor(row: PostListItem): string {
  return row.postKind === "spike" && row.parentSlug
    ? `/${row.parentSlug}/${row.slug}`
    : `/${row.slug}`;
}

function TopicsCell({
  topicIds,
  catalog,
}: {
  topicIds: number[];
  catalog: Record<number, { id: number; name: string; slug: string }>;
}) {
  if (topicIds.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  // Render at most 2 pills; collapse the rest into a "+N" with full names
  // in a tooltip so the column stays narrow without losing data.
  const visible = topicIds.slice(0, 2);
  const overflow = topicIds.slice(2);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((id) => {
        const t = catalog[id];
        if (!t) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
          >
            <Tag className="size-2.5" />
            {t.name}
          </span>
        );
      })}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200 cursor-default">
                +{overflow.length}
              </span>
            }
          />
          <TooltipContent>
            {overflow
              .map((id) => catalog[id]?.name)
              .filter(Boolean)
              .join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function TemplateCell({
  template,
  postKind,
}: {
  template: string | null;
  postKind: PostKind;
}) {
  const labels = useContext(TemplateLabelContext);
  if (!template) return <span className="text-slate-400">Default</span>;
  // Pillar posts pull from the pillar-parent customs; everything else
  // from single-post-parent customs. Falls back to the raw slug when the
  // saved template no longer exists in the active theme.
  const lookup = postKind === "pillar" ? labels.pillar : labels.post;
  return <>{lookup.get(template) ?? template}</>;
}

function TrashedCell({ trashedAt }: { trashedAt: string }) {
  const trashedDate = new Date(
    trashedAt.includes("T") ? trashedAt : trashedAt.replace(" ", "T") + "Z",
  );
  const purgeAt = new Date(trashedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(
    0,
    Math.ceil((purgeAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  return (
    <div className="flex flex-col">
      <FormattedDate iso={trashedAt} />
      <span className={`text-[10px] ${daysLeft <= 3 ? "text-rose-600" : "text-slate-400"}`}>
        {daysLeft === 0 ? "Purging soon" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
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

