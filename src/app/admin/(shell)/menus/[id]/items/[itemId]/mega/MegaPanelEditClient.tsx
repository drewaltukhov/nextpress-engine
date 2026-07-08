"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, Loader2, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@core/components/ConfirmDialog";
import { ContentPickerDialog } from "@core/components/ContentLinkInput";
import { AdminSection, type AdminTab } from "@core/components/AdminSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@core/components/RichTextEditor";
import type { WidthMode } from "@core-plugins/mega-menu";
import {
  savePanelAction,
  deletePanelAction,
  type PostOption,
  type TopicOption,
  type PillarOption,
} from "./actions";

export interface LayoutMeta {
  id: string;
  name: string;
  description: string;
  thumbnailSvg: string;
}

interface InitialState {
  layoutId: string;
  config: unknown;
  widthMode: WidthMode;
}

interface Props {
  menuId: number;
  itemId: number;
  menuName: string;
  itemLabel: string;
  layouts: LayoutMeta[];
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
  initial: InitialState | null;
}

// Card chrome — matches the canonical settings-form pattern
// (SmtpSettingsForm, ApiSettingsForm, etc.).
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";
const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function MegaPanelEditClient({
  menuId,
  itemId,
  menuName,
  itemLabel,
  layouts,
  posts,
  topics,
  pillars,
  initial,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Local state — the picker controls layoutId; each layout's config is
  // a free-form object stored per-layoutId so flipping between layouts
  // doesn't lose previous fills.
  const [layoutId, setLayoutId] = useState<string>(initial?.layoutId ?? layouts[0]?.id ?? "editorial");
  const [widthMode, setWidthMode] = useState<WidthMode>(initial?.widthMode ?? "full");
  const [configByLayout, setConfigByLayout] = useState<Record<string, unknown>>(() => ({
    [initial?.layoutId ?? layouts[0]?.id ?? "editorial"]: (initial?.config as object) ?? {},
  }));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const config = configByLayout[layoutId] ?? {};
  function setConfig(next: unknown) {
    setConfigByLayout((m) => ({ ...m, [layoutId]: next }));
    setHasUnsavedChanges(true);
  }

  const backHref = `/admin/menus/${menuId}/edit`;
  const hasExistingPanel = initial != null;

  function handleSave() {
    startTransition(async () => {
      const result = await savePanelAction(menuId, itemId, { layoutId, config, widthMode });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHasUnsavedChanges(false);
      toast.success("Mega panel saved");
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Remove mega panel?",
      description: (
        <>
          This deletes the panel attached to <strong>{itemLabel}</strong>. The menu item
          itself stays; it just reverts to a plain link.
        </>
      ),
      confirmLabel: "Remove panel",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deletePanelAction(menuId, itemId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mega panel removed");
      router.push(backHref);
    });
  }

  return (
    <div className="-mx-6 -my-8 min-h-[calc(100vh-6.5rem)] flex flex-col">
      <header className="flex items-center justify-between gap-3 px-6 h-14 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
            Back to menu
          </Link>
          <span className="text-slate-300">/</span>
          <div className="min-w-0 truncate">
            <span className="text-sm text-slate-500 mr-1">{menuName} →</span>
            <span className="text-sm font-medium text-slate-900">{itemLabel}</span>
            <span className="ml-2 text-xs text-slate-400">mega panel</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
          {hasExistingPanel && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              Remove panel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || (hasExistingPanel && !hasUnsavedChanges)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </button>
        </div>
      </header>

      {/* Body — no max-width, just side padding so the cards reach the
          available width. Cards line up in a 12-col grid: layout +
          width on the left (5 cols), options on the right (7 cols).
          Stacks to a single column below `lg`. */}
      <div className="flex-1 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-6">
          <div className="lg:col-span-5 space-y-4">
            {/* ─── Card 1: Layout picker ─── */}
            <section className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900">Layout</h2>
              <p className="text-sm text-slate-500 mb-4">
                Pick the panel shape. Each layout has its own options on the right.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {layouts.map((l) => (
                  <LayoutCard
                    key={l.id}
                    layout={l}
                    selected={layoutId === l.id}
                    onSelect={() => {
                      if (l.id !== layoutId) {
                        setLayoutId(l.id);
                        if (!(l.id in configByLayout)) {
                          setConfigByLayout((m) => ({ ...m, [l.id]: {} }));
                        }
                        setHasUnsavedChanges(true);
                      }
                    }}
                  />
                ))}
              </div>
            </section>

            {/* ─── Card 2: Panel width ─── */}
            <section className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900 mb-3">Panel width</h2>
              <div className="space-y-2">
                <WidthOption
                  value="full"
                  checked={widthMode === "full"}
                  onChange={() => {
                    setWidthMode("full");
                    setHasUnsavedChanges(true);
                  }}
                  label="Full screen width"
                  help="Panel spans the viewport, breaking out of the nav's container."
                />
                <WidthOption
                  value="container"
                  checked={widthMode === "container"}
                  onChange={() => {
                    setWidthMode("container");
                    setHasUnsavedChanges(true);
                  }}
                  label="Container width"
                  help="Aligned to the theme's container — same edges as the header itself."
                />
              </div>
            </section>
          </div>

          <div className="lg:col-span-7">
            {/* ─── Card 3: Layout-specific options ─── */}
            <section className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900">
                {layouts.find((l) => l.id === layoutId)?.name ?? layoutId} options
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Fill in the fields the layout needs. Empty fields use sensible defaults at render time.
              </p>
              <ConfigForm
                layoutId={layoutId}
                config={config}
                onChange={setConfig}
                posts={posts}
                topics={topics}
                pillars={pillars}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───── Layout card (picker tile) ──────────────────────────────────────

function LayoutCard({
  layout,
  selected,
  onSelect,
}: {
  layout: LayoutMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border p-3 transition ${
        selected
          ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30"
          : "border-slate-200 hover:border-slate-300 bg-white"
      }`}
    >
      <div className="flex gap-3">
        <div
          className="w-32 shrink-0 aspect-[200/110] rounded-md overflow-hidden bg-slate-50 border border-slate-200"
          dangerouslySetInnerHTML={{ __html: layout.thumbnailSvg }}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{layout.name}</div>
          <div className="text-xs text-slate-500 mt-0.5 leading-snug">{layout.description}</div>
        </div>
      </div>
    </button>
  );
}

// ───── Width option (radio) ───────────────────────────────────────────

function WidthOption({
  value,
  checked,
  onChange,
  label,
  help,
}: {
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  help: string;
}) {
  return (
    <label className={`block rounded-lg border p-3 cursor-pointer transition ${checked ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="flex items-start gap-2">
        <input
          type="radio"
          name="width-mode"
          value={value}
          checked={checked}
          onChange={onChange}
          className="mt-1 size-4 accent-emerald-600"
        />
        <div>
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{help}</div>
        </div>
      </div>
    </label>
  );
}

// ───── Config form — switches on layoutId ─────────────────────────────

function ConfigForm({
  layoutId,
  config,
  onChange,
  posts,
  topics,
  pillars,
}: {
  layoutId: string;
  config: unknown;
  onChange: (next: unknown) => void;
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
}) {
  if (layoutId === "editorial")
    return (
      <EditorialForm
        config={config}
        onChange={onChange}
        posts={posts}
        topics={topics}
        pillars={pillars}
      />
    );
  if (layoutId === "multi-section")
    return (
      <MultiSectionForm
        config={config}
        onChange={onChange}
        posts={posts}
        topics={topics}
        pillars={pillars}
      />
    );
  if (layoutId === "showcase")
    return (
      <ShowcaseForm
        config={config}
        onChange={onChange}
        posts={posts}
        topics={topics}
        pillars={pillars}
      />
    );
  return <p className="text-sm text-slate-500">Unknown layout — pick a different one on the left.</p>;
}

// ───── Editorial form ─────────────────────────────────────────────────

interface EditorialCfg {
  eyebrowFeatured?: string;
  eyebrowRecent?: string;
  featuredPostId?: number | null;
  recentLimit?: number;
  recentPillarIds?: number[];
  recentTopicIds?: number[];
  recentStyle?: "list" | "cards";
  cardAspect?: "rectangle" | "wide" | "square";
  showThumbnails?: boolean;
  showDates?: boolean;
  showFeaturedExcerpt?: boolean;
  showRecentExcerpts?: boolean;
  /** Legacy single toggle — read as fallback for both new fields when
   *  saved panels haven't been resaved yet. */
  showExcerpts?: boolean;
  showSeparators?: boolean;
  cta?: { label: string; href: string } | null;
}

function EditorialForm({
  config,
  onChange,
  posts,
  topics,
  pillars,
}: {
  config: unknown;
  onChange: (next: unknown) => void;
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
}) {
  const c = (config ?? {}) as EditorialCfg;
  function patch(p: Partial<EditorialCfg>) {
    onChange({ ...c, ...p });
  }
  // showThumbnails / showDates default in the layout's parseConfig: thumbs
  // on, dates off. Mirror the same defaults here so a fresh form reflects
  // the rendered behavior.
  const showThumbnails = c.showThumbnails ?? true;
  const showDates = c.showDates ?? false;
  const recentStyle = c.recentStyle ?? "list";
  const cardAspect = c.cardAspect ?? "rectangle";

  const contentTab = (
    <div className="space-y-4">
      <Field label="Featured eyebrow">
        <input
          type="text"
          value={c.eyebrowFeatured ?? ""}
          onChange={(e) => patch({ eyebrowFeatured: e.target.value })}
          placeholder="Featured"
          className={inputCls}
        />
      </Field>
      <Field label="Featured post" help="Pick a specific post, or leave blank to auto-pick the most recent post with an image.">
        <PostPicker value={c.featuredPostId ?? null} onChange={(v) => patch({ featuredPostId: v })} posts={posts} />
      </Field>
      <Field label="Recent posts eyebrow">
        <input
          type="text"
          value={c.eyebrowRecent ?? ""}
          onChange={(e) => patch({ eyebrowRecent: e.target.value })}
          placeholder="Latest posts"
          className={inputCls}
        />
      </Field>
      <Field label="Recent posts count" help="Between 2 and 10. Defaults to 6.">
        <input
          type="number"
          min={2}
          max={10}
          value={c.recentLimit ?? 6}
          onChange={(e) => patch({ recentLimit: Number(e.target.value) || 6 })}
          className={inputCls}
        />
      </Field>
      <Field
        label="Recent posts style"
        help="List = small thumb + title row. Cards = bigger image-on-top tile."
      >
        <SegmentedRadio
          name="editorial-recent-style"
          value={recentStyle}
          onChange={(v) => patch({ recentStyle: v as "list" | "cards" })}
          options={[
            { value: "list", label: "List" },
            { value: "cards", label: "Cards" },
          ]}
        />
      </Field>
      {recentStyle === "cards" && (
        <Field label="Card thumbnail shape">
          <SegmentedRadio
            name="editorial-card-aspect"
            value={cardAspect}
            onChange={(v) => patch({ cardAspect: v as "rectangle" | "wide" | "square" })}
            options={[
              { value: "rectangle", label: "Rectangle (4 / 3)" },
              { value: "wide", label: "Wide (16 / 9)" },
              { value: "square", label: "Square (1 / 1)" },
            ]}
          />
        </Field>
      )}
      <Field label="CTA link (optional)">
        <CtaInput value={c.cta ?? null} onChange={(v) => patch({ cta: v })} />
      </Field>
    </div>
  );

  const filtersTab = (
    <div className="space-y-4">
      <Field
        label="Filter recent posts by pillars"
        help="Show only spikes (children) of these pillars — the canonical mega-menu shape. Leave empty for any post."
      >
        <PillarMultiPicker
          value={c.recentPillarIds ?? []}
          onChange={(v) => patch({ recentPillarIds: v })}
          pillars={pillars}
        />
      </Field>
      <Field label="Filter recent posts by topics" help="Narrow further — posts must match at least one of these topics. Combines with the pillar filter.">
        <TopicMultiPicker value={c.recentTopicIds ?? []} onChange={(v) => patch({ recentTopicIds: v })} topics={topics} />
      </Field>
    </div>
  );

  const displayTab = (
    <div className="space-y-4">
      {/* List-only — cards always show the thumbnail by definition. */}
      {recentStyle === "list" && (
        <ToggleRow
          label="Show recent-post thumbnails"
          help="Small thumbs next to each recent post. The featured hero image is always shown — it's the visual anchor of the layout."
          checked={showThumbnails}
          onChange={(v) => patch({ showThumbnails: v })}
        />
      )}
      <ToggleRow
        label="Show post dates"
        help="Published date under each post title."
        checked={showDates}
        onChange={(v) => patch({ showDates: v })}
      />
      <ToggleRow
        label="Show featured post excerpt"
        help="Two-line excerpt under the featured (left-column) post title."
        checked={c.showFeaturedExcerpt ?? c.showExcerpts ?? true}
        onChange={(v) => patch({ showFeaturedExcerpt: v })}
      />
      <ToggleRow
        label="Show recent post excerpts"
        help="Two-line excerpt under each recent post title — applies to both list and cards style."
        checked={c.showRecentExcerpts ?? c.showExcerpts ?? true}
        onChange={(v) => patch({ showRecentExcerpts: v })}
      />
      {/* List-only — tile breaks already give cards visual separation. */}
      {recentStyle === "list" && (
        <ToggleRow
          label="Show separator lines"
          help="1px line between rows in the recent-posts grid for visual rhythm."
          checked={c.showSeparators ?? false}
          onChange={(v) => patch({ showSeparators: v })}
        />
      )}
    </div>
  );

  const tabs: AdminTab[] = [
    { value: "content", label: "Content", content: contentTab },
    { value: "filters", label: "Filters", content: filtersTab },
    { value: "display", label: "Display", content: displayTab },
  ];
  return <AdminSection tabs={tabs} />;
}

// ───── Multi-section form ─────────────────────────────────────────────

interface MultiSectionLink {
  label: string;
  href: string;
  postId?: number | null;
  target?: "_self" | "_blank";
}
interface MultiSectionSection {
  heading: string;
  mode?: "manual" | "auto";
  links: MultiSectionLink[];
  /** Auto-mode feed source. Defaults to "pillar" when absent so older
   *  configs keep their behavior unchanged. */
  autoSourceMode?: "pillar" | "topic";
  autoPillarId?: number | null;
  /** Topic ids whose latest published posts feed the column (auto+topic
   *  mode). OR-combined. */
  autoTopicIds?: number[];
  autoLimit?: number;
  showDate?: boolean;
  showThumbnail?: boolean;
  showExcerpt?: boolean;
  showSeparator?: boolean;
  cta?: CtaValue | null;
}
interface MultiSectionCfg {
  sections?: MultiSectionSection[];
  featuredEyebrow?: string;
  featuredPostId?: number | null;
  featuredShowDate?: boolean;
  featuredShowExcerpt?: boolean;
}

function MultiSectionForm({
  config,
  onChange,
  posts,
  topics,
  pillars,
}: {
  config: unknown;
  onChange: (next: unknown) => void;
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
}) {
  const c = (config ?? {}) as MultiSectionCfg;
  const sections: MultiSectionSection[] = c.sections ?? [
    { heading: "Guides", mode: "manual", links: [] },
    { heading: "Reference", mode: "manual", links: [] },
    { heading: "Recipes", mode: "manual", links: [] },
  ];
  function patch(p: Partial<MultiSectionCfg>) {
    onChange({ ...c, sections, ...p });
  }
  function patchSection(i: number, next: MultiSectionSection) {
    const arr = sections.slice();
    arr[i] = next;
    patch({ sections: arr });
  }
  // Build the spike list per pillar once; the popover reuses it across
  // all three column buttons.
  const spikesByPillar = useMemo(() => {
    const m = new Map<number, PostOption[]>();
    for (const p of posts) {
      if (p.kind === "spike" && p.parentId != null) {
        const arr = m.get(p.parentId) ?? [];
        arr.push(p);
        m.set(p.parentId, arr);
      }
    }
    return m;
  }, [posts]);
  function renderSection(i: number) {
    const s = sections[i]!;
    const mode = s.mode ?? "manual";
    return (
      <div className="space-y-3">
        <Field label="Heading">
          <input
            type="text"
            value={s.heading}
            onChange={(e) => patchSection(i, { ...s, heading: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field
          label="Source"
          help="Auto = latest posts from a pillar or one/more topics (refreshes as you publish). Manual = curated link list."
        >
          <SegmentedRadio
            name={`multi-mode-${i}`}
            value={mode}
            onChange={(v) => patchSection(i, { ...s, mode: v as "manual" | "auto" })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </Field>

        {mode === "auto" ? (
          <>
            <Field label="Auto from" help="Pillar = latest spikes of one pillar. Topics = latest posts tagged with any selected topic.">
              <SegmentedRadio
                name={`multi-auto-src-${i}`}
                value={s.autoSourceMode ?? "pillar"}
                onChange={(v) =>
                  patchSection(i, { ...s, autoSourceMode: v as "pillar" | "topic" })
                }
                options={[
                  { value: "pillar", label: "Pillar" },
                  { value: "topic", label: "Topics" },
                ]}
              />
            </Field>
            {(s.autoSourceMode ?? "pillar") === "topic" ? (
              <Field label="Topics" help="Posts tagged with ANY of the selected topics will feed the column.">
                <TopicCheckboxDropdown
                  value={s.autoTopicIds ?? []}
                  onChange={(v) => patchSection(i, { ...s, autoTopicIds: v })}
                  topics={topics}
                />
              </Field>
            ) : (
              <Field label="Pillar" help="Latest published spikes of this pillar fill the column.">
                <PillarSinglePicker
                  value={s.autoPillarId ?? null}
                  onChange={(v) => patchSection(i, { ...s, autoPillarId: v })}
                  pillars={pillars}
                  spikesByPillar={spikesByPillar}
                />
              </Field>
            )}
            <Field label="Max posts to show" help="Between 1 and 20. Defaults to 5.">
              <input
                type="number"
                min={1}
                max={20}
                value={s.autoLimit ?? 5}
                onChange={(e) =>
                  patchSection(i, { ...s, autoLimit: Number(e.target.value) || 5 })
                }
                className={inputCls}
              />
            </Field>
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Links</label>
              <FillFromPillarButton
                pillars={pillars}
                spikesByPillar={spikesByPillar}
                onPick={(pillar) => {
                  // Replace the section's links with one row per spike.
                  // Heading is left alone — the editor may have already
                  // typed something they like.
                  const spikes = spikesByPillar.get(pillar.id) ?? [];
                  const links: MultiSectionLink[] = spikes.map((sp) => ({
                    label: sp.title,
                    href: `/${pillar.slug}/${sp.slug}`,
                    postId: sp.id,
                  }));
                  patchSection(i, { ...s, links });
                }}
              />
            </div>
            <LinkListInput
              value={s.links}
              onChange={(links) => patchSection(i, { ...s, links })}
            />
          </div>
        )}

        {/* Per-column display toggles. Thumbnail + date apply only
            when each row carries post meta — that is always true in
            auto mode, but in manual mode the editor types arbitrary
            links so those toggles are hidden (separator still
            applies — it's purely visual). */}
        <div
          className={`grid grid-cols-1 ${
            mode === "auto" ? "sm:grid-cols-3" : "sm:grid-cols-1"
          } gap-2 pt-1`}
        >
          {mode === "auto" && (
            <>
              <ToggleRow
                label="Show thumbnail"
                checked={s.showThumbnail ?? false}
                onChange={(v) => patchSection(i, { ...s, showThumbnail: v })}
              />
              <ToggleRow
                label="Show date"
                checked={s.showDate ?? false}
                onChange={(v) => patchSection(i, { ...s, showDate: v })}
              />
              <ToggleRow
                label="Show excerpt"
                checked={s.showExcerpt ?? false}
                onChange={(v) => patchSection(i, { ...s, showExcerpt: v })}
              />
            </>
          )}
          <ToggleRow
            label="Show separator"
            checked={s.showSeparator ?? false}
            onChange={(v) => patchSection(i, { ...s, showSeparator: v })}
          />
        </div>

        <Field label="Column CTA (optional)" help="Plain link rendered below the rows.">
          <CtaInput
            value={s.cta ?? null}
            onChange={(v) => patchSection(i, { ...s, cta: v })}
          />
        </Field>
      </div>
    );
  }

  const featuredTab = (
    <div className="space-y-4">
      <Field label="Featured column eyebrow">
        <input
          type="text"
          value={c.featuredEyebrow ?? ""}
          onChange={(e) => patch({ featuredEyebrow: e.target.value })}
          placeholder="Featured"
          className={inputCls}
        />
      </Field>
      <Field label="Featured post">
        <PostPicker value={c.featuredPostId ?? null} onChange={(v) => patch({ featuredPostId: v })} posts={posts} />
      </Field>
      <ToggleRow
        label="Show featured post date"
        help="Display the published date below the featured post's title."
        checked={c.featuredShowDate ?? false}
        onChange={(v) => patch({ featuredShowDate: v })}
      />
      <ToggleRow
        label="Show featured post excerpt"
        help="Display the post's excerpt (2-line clamp) below the featured post's title."
        checked={c.featuredShowExcerpt ?? false}
        onChange={(v) => patch({ featuredShowExcerpt: v })}
      />
    </div>
  );

  const tabs: AdminTab[] = [
    { value: "featured", label: "Featured", content: featuredTab },
    ...sections.map((s, i) => ({
      value: `col-${i}`,
      label: s.heading?.trim() || `Column ${i + 1}`,
      content: renderSection(i),
    })),
  ];
  return <AdminSection tabs={tabs} />;
}

// Small popover button: lists pillars (with their spike count) and
// invokes onPick when one is chosen. Used by the Multi-section column
// editor to bulk-fill a column with one pillar's spikes.
function FillFromPillarButton({
  pillars,
  spikesByPillar,
  onPick,
}: {
  pillars: PillarOption[];
  spikesByPillar: Map<number, PostOption[]>;
  onPick: (pillar: PillarOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
      >
        <Plus className="size-3" />
        Fill from pillar
      </PopoverTrigger>
      <PopoverContent align="end" className="p-1 w-64">
        {pillars.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-500">No pillars yet.</div>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {pillars.map((p) => {
              const count = spikesByPillar.get(p.id)?.length ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p);
                      setOpen(false);
                    }}
                    disabled={count === 0}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400 tabular-nums">
                      {count} {count === 1 ? "spike" : "spikes"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ───── Showcase form ──────────────────────────────────────────────────

interface ShowcaseCfg {
  tilesEyebrow?: string;
  tilesLimit?: number;
  tilesPillarIds?: number[];
  tilesTopicIds?: number[];
  cardAspect?: "rectangle" | "wide" | "square";
  showTilesDate?: boolean;
  showTilesExcerpt?: boolean;
  tilesCta?: CtaValue | null;
  sidebarHeading?: string;
  sidebarMode?: "manual" | "auto";
  sidebarLinks?: ListLink[];
  sidebarAutoPillarId?: number | null;
  sidebarAutoLimit?: number;
  showSidebarDate?: boolean;
  showSidebarThumbnail?: boolean;
  showSidebarSeparator?: boolean;
  showSidebarExcerpt?: boolean;
  sidebarRichText?: string;
  cta?: CtaValue | null;
}

function ShowcaseForm({
  config,
  onChange,
  posts,
  topics,
  pillars,
}: {
  config: unknown;
  onChange: (next: unknown) => void;
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
}) {
  const c = (config ?? {}) as ShowcaseCfg;
  function patch(p: Partial<ShowcaseCfg>) {
    onChange({ ...c, ...p });
  }
  // Pre-bucket spikes per pillar — same map the multi-section form
  // builds, used by both the tile filter chips' counts and the sidebar
  // "Fill from pillar" popover.
  const spikesByPillar = useMemo(() => {
    const m = new Map<number, PostOption[]>();
    for (const p of posts) {
      if (p.kind === "spike" && p.parentId != null) {
        const arr = m.get(p.parentId) ?? [];
        arr.push(p);
        m.set(p.parentId, arr);
      }
    }
    return m;
  }, [posts]);
  const sidebarLinks = c.sidebarLinks ?? [];

  const tilesTab = (
    <div className="space-y-4">
      <Field label="Tile grid eyebrow">
        <input
          type="text"
          value={c.tilesEyebrow ?? ""}
          onChange={(e) => patch({ tilesEyebrow: e.target.value })}
          placeholder="From the blog"
          className={inputCls}
        />
      </Field>
      <Field label="Tile count" help="Between 3 and 9. Defaults to 6.">
        <input
          type="number"
          min={3}
          max={9}
          value={c.tilesLimit ?? 6}
          onChange={(e) => patch({ tilesLimit: Number(e.target.value) || 6 })}
          className={inputCls}
        />
      </Field>
      <Field
        label="Filter tiles by pillars"
        help="Only show spikes (children) of these pillars. Empty = all posts."
      >
        <PillarMultiPicker
          value={c.tilesPillarIds ?? []}
          onChange={(v) => patch({ tilesPillarIds: v })}
          pillars={pillars}
        />
      </Field>
      <Field label="Filter tiles by topics" help="Narrow further — posts must match at least one of these topics. Combines with the pillar filter.">
        <TopicMultiPicker value={c.tilesTopicIds ?? []} onChange={(v) => patch({ tilesTopicIds: v })} topics={topics} />
      </Field>
      <Field label="Tile thumbnail shape">
        <SegmentedRadio
          name="showcase-card-aspect"
          value={c.cardAspect ?? "rectangle"}
          onChange={(v) => patch({ cardAspect: v as "rectangle" | "wide" | "square" })}
          options={[
            { value: "rectangle", label: "Rectangle (4 / 3)" },
            { value: "wide", label: "Wide (16 / 9)" },
            { value: "square", label: "Square (1 / 1)" },
          ]}
        />
      </Field>
      <ToggleRow
        label="Show date on tiles"
        help="Published date under each tile title."
        checked={c.showTilesDate ?? false}
        onChange={(v) => patch({ showTilesDate: v })}
      />
      <ToggleRow
        label="Show excerpt on tiles"
        help="Two-line post excerpt under each tile title."
        checked={c.showTilesExcerpt ?? false}
        onChange={(v) => patch({ showTilesExcerpt: v })}
      />
      <Field label="Tile grid CTA (optional)" help="Plain link rendered below the tile grid.">
        <CtaInput value={c.tilesCta ?? null} onChange={(v) => patch({ tilesCta: v })} />
      </Field>
    </div>
  );

  const sidebarTab = (
    <div className="space-y-4">
      <Field label="Sidebar heading">
        <input
          type="text"
          value={c.sidebarHeading ?? ""}
          onChange={(e) => patch({ sidebarHeading: e.target.value })}
          placeholder="Highlights"
          className={inputCls}
        />
      </Field>
      <Field
        label="Sidebar source"
        help="From Pillar = latest spikes from a pillar (refreshes as you publish). Manual = curated link list."
      >
        <SegmentedRadio
          name="showcase-sidebar-mode"
          value={c.sidebarMode ?? "manual"}
          onChange={(v) => patch({ sidebarMode: v as "manual" | "auto" })}
          options={[
            { value: "auto", label: "From Pillar" },
            { value: "manual", label: "Manual" },
          ]}
        />
      </Field>

      {(c.sidebarMode ?? "manual") === "auto" ? (
        <>
          <Field label="Pillar" help="Latest published spikes of this pillar fill the sidebar.">
            <PillarSinglePicker
              value={c.sidebarAutoPillarId ?? null}
              onChange={(v) => patch({ sidebarAutoPillarId: v })}
              pillars={pillars}
              spikesByPillar={spikesByPillar}
            />
          </Field>
          <Field label="Max posts to show" help="Between 1 and 20. Defaults to 5.">
            <input
              type="number"
              min={1}
              max={20}
              value={c.sidebarAutoLimit ?? 5}
              onChange={(e) => patch({ sidebarAutoLimit: Number(e.target.value) || 5 })}
              className={inputCls}
            />
          </Field>
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">Sidebar links</label>
            <FillFromPillarButton
              pillars={pillars}
              spikesByPillar={spikesByPillar}
              onPick={(pillar) => {
                const spikes = spikesByPillar.get(pillar.id) ?? [];
                const links: ListLink[] = spikes.map((sp) => ({
                  label: sp.title,
                  href: `/${pillar.slug}/${sp.slug}`,
                  target: "_self",
                  postId: sp.id,
                }));
                patch({ sidebarLinks: links });
              }}
            />
          </div>
          <LinkListInput value={sidebarLinks} onChange={(v) => patch({ sidebarLinks: v })} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ToggleRow
          label="Show thumbnail"
          help="Small image next to each row. Only renders when the row is sourced from a post."
          checked={c.showSidebarThumbnail ?? false}
          onChange={(v) => patch({ showSidebarThumbnail: v })}
        />
        <ToggleRow
          label="Show date"
          help="Published date under each link. Only renders when the row is sourced from a post."
          checked={c.showSidebarDate ?? false}
          onChange={(v) => patch({ showSidebarDate: v })}
        />
        <ToggleRow
          label="Show excerpt"
          help="Two-line post excerpt under each link. Only renders when the row is sourced from a post."
          checked={c.showSidebarExcerpt ?? false}
          onChange={(v) => patch({ showSidebarExcerpt: v })}
        />
        <ToggleRow
          label="Show separator lines"
          help="1px line between sidebar rows for visual rhythm."
          checked={c.showSidebarSeparator ?? false}
          onChange={(v) => patch({ showSidebarSeparator: v })}
        />
      </div>
      <Field
        label="Sidebar text (optional)"
        help="Renders below the link list (with a divider) — or alone when there are no links. Opens a small Tiptap editor."
      >
        <RichTextModalField
          value={c.sidebarRichText ?? ""}
          onChange={(v) => patch({ sidebarRichText: v })}
        />
      </Field>
      <Field label="CTA link (optional)">
        <CtaInput value={c.cta ?? null} onChange={(v) => patch({ cta: v })} />
      </Field>
    </div>
  );

  const tabs: AdminTab[] = [
    { value: "tiles", label: "Tiles", content: tilesTab },
    { value: "sidebar", label: "Sidebar", content: sidebarTab },
  ];
  return <AdminSection tabs={tabs} />;
}

// Modal wrapper around the existing Tiptap editor. The editor itself is
// "use client" — wrapping it in a Dialog keeps it out of the form's
// vertical real estate (the inspector column would otherwise blow out).
function RichTextModalField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Buffer edits until "Save" so cancelling discards changes.
  const [draft, setDraft] = useState(value);
  function openEditor() {
    setDraft(value);
    setOpen(true);
  }
  // Strip HTML for a small preview blurb in the trigger button.
  const preview = useMemo(() => {
    if (!value || value.trim() === "") return "";
    const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }, [value]);
  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300"
        >
          <Pencil className="size-3.5" />
          {value ? "Edit text" : "Add text"}
        </button>
        {value && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
            <div className="flex-1 min-w-0 text-xs text-slate-700 leading-relaxed">
              {preview || "(empty)"}
            </div>
            <button
              type="button"
              onClick={() => onChange("")}
              className="shrink-0 inline-flex items-center justify-center size-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-100"
              aria-label="Clear text"
              title="Clear"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sidebar text</DialogTitle>
            <DialogDescription>
              Renders below the sidebar heading when no curated links are set.
            </DialogDescription>
          </DialogHeader>
          <RichTextEditor value={draft} onChange={setDraft} minHeight={200} />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              className="h-9 px-3 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───── Reusable form bits ─────────────────────────────────────────────

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      {/* `text-sm` matches the canonical settings-form labelCls in
          SmtpSettingsForm / ApiSettingsForm — same look, same weight. */}
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
    </div>
  );
}

function PostPicker({
  value,
  onChange,
  posts,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  posts: PostOption[];
}) {
  // Group posts: standalones at the top, then each pillar followed by
  // its indented spikes, ordered by pillar position in the original
  // posts list.
  const ordered = useMemo(() => {
    const byParent = new Map<number, PostOption[]>();
    for (const p of posts) {
      if (p.kind === "spike" && p.parentId != null) {
        const arr = byParent.get(p.parentId) ?? [];
        arr.push(p);
        byParent.set(p.parentId, arr);
      }
    }
    const standalones = posts.filter((p) => p.kind === "standalone");
    const pillars = posts.filter((p) => p.kind === "pillar");
    const out: { post: PostOption; depth: number }[] = [];
    for (const s of standalones) out.push({ post: s, depth: 0 });
    for (const p of pillars) {
      out.push({ post: p, depth: 0 });
      const spikes = byParent.get(p.id) ?? [];
      for (const sp of spikes) out.push({ post: sp, depth: 1 });
    }
    return out;
  }, [posts]);

  // Lookup by id so the trigger can render the selected post's title
  // (radix Select sometimes shows the raw value when SelectItem children
  // are non-trivial — explicit `children` on <SelectValue> is the
  // canonical workaround).
  const selectedTitle = useMemo(() => {
    if (value == null) return null;
    return posts.find((p) => p.id === value)?.title ?? `Post #${value}`;
  }, [value, posts]);

  return (
    <Select
      value={value == null ? "__none__" : String(value)}
      onValueChange={(v) => onChange(v === "__none__" ? null : Number(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Auto (most recent with image)">
          {value == null ? "— Auto (most recent with image) —" : selectedTitle}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Auto (most recent with image) —</SelectItem>
        {ordered.map(({ post, depth }) => (
          <SelectItem key={post.id} value={String(post.id)}>
            <span style={{ paddingLeft: depth * 16 }}>
              {depth > 0 ? "↳ " : ""}
              {post.title}
              {post.kind === "pillar" && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-600">pillar</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PillarMultiPicker({
  value,
  onChange,
  pillars,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  pillars: PillarOption[];
}) {
  const selected = useMemo(() => new Set(value), [value]);
  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {pillars.length === 0 ? (
        <span className="text-xs text-slate-400 italic">No pillars yet.</span>
      ) : (
        pillars.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                on
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {p.title}
              {on && <X className="size-3.5" />}
            </button>
          );
        })
      )}
    </div>
  );
}

// Single-pillar select for the Multi-section auto-mode column.
// Shows pillar title + spike count in the dropdown so the editor can
// see at a glance which pillars actually have content.
function PillarSinglePicker({
  value,
  onChange,
  pillars,
  spikesByPillar,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  pillars: PillarOption[];
  spikesByPillar: Map<number, PostOption[]>;
}) {
  const selectedTitle = useMemo(() => {
    if (value == null) return null;
    return pillars.find((p) => p.id === value)?.title ?? `Pillar #${value}`;
  }, [value, pillars]);
  return (
    <Select
      value={value == null ? "__none__" : String(value)}
      onValueChange={(v) => onChange(v === "__none__" ? null : Number(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Pick a pillar…">
          {value == null ? "— Pick a pillar… —" : selectedTitle}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Pick a pillar… —</SelectItem>
        {pillars.map((p) => {
          const count = spikesByPillar.get(p.id)?.length ?? 0;
          return (
            <SelectItem key={p.id} value={String(p.id)}>
              <span>
                {p.title}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                  {count} {count === 1 ? "spike" : "spikes"}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 bg-white">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {help && <p className="mt-0.5 text-xs text-slate-500">{help}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

// Inline segmented radio control — visually like a tab strip, but
// semantically a `<radiogroup>` so keyboard + screen readers behave.
function SegmentedRadio({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <label
            key={opt.value}
            className={`px-3 py-1.5 text-sm rounded-[5px] cursor-pointer transition select-none ${
              on
                ? "bg-emerald-600 text-white border border-emerald-600 shadow-sm"
                : "text-slate-600 border border-transparent hover:text-slate-900"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={on}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/** Compact checkbox-style dropdown for picking multiple topics. Used in
 *  the multi-section auto-topic flow where the picker sits inside a
 *  narrow column form and the chip-style TopicMultiPicker would dominate
 *  the layout. */
function TopicCheckboxDropdown({
  value,
  onChange,
  topics,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  topics: TopicOption[];
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  const triggerLabel =
    value.length === 0
      ? "Select topics…"
      : value.length === 1
        ? topics.find((t) => t.id === value[0])?.name ?? "1 topic"
        : `${value.length} topics`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={value.length === 0 ? "text-slate-400" : "text-slate-800"}>
          {triggerLabel}
        </span>
        <ChevronDown className="size-4 text-slate-400 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 w-72">
        {topics.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-500">No topics yet.</div>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {topics.map((t) => {
              const on = selected.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <span
                      aria-hidden
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        on ? "bg-emerald-600 border-emerald-600" : "bg-white border-slate-300"
                      }`}
                    >
                      {on && <Check className="size-3 text-white" />}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TopicMultiPicker({
  value,
  onChange,
  topics,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  topics: TopicOption[];
}) {
  const selected = useMemo(() => new Set(value), [value]);
  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {topics.length === 0 ? (
        <span className="text-xs text-slate-400 italic">No topics yet.</span>
      ) : (
        topics.map((t) => {
          const on = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                on
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.name}
              {on && <X className="size-3" />}
            </button>
          );
        })
      )}
    </div>
  );
}

interface ListLink {
  label: string;
  href: string;
  postId?: number | null;
  target?: "_self" | "_blank";
}
function LinkListInput({
  value,
  onChange,
}: {
  value: ListLink[];
  onChange: (v: ListLink[]) => void;
}) {
  function patch(i: number, next: ListLink) {
    const arr = value.slice();
    arr[i] = next;
    onChange(arr);
  }
  function add() {
    onChange([...value, { label: "", href: "" }]);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex gap-2">
          {/* Label is the shorter field (basis-1/3); URL takes the rest
              and gets the picker button next to it. Target toggle and
              Remove sit at the end. */}
          <input
            type="text"
            placeholder="Label"
            value={l.label}
            onChange={(e) => patch(i, { ...l, label: e.target.value })}
            className={`${inputCls} basis-1/3 shrink-0`}
          />
          <UrlField
            value={l.href}
            onChange={(v) => patch(i, { ...l, href: v })}
            className="flex-1 min-w-0"
          />
          <TargetToggle
            value={l.target ?? "_self"}
            onChange={(v) => patch(i, { ...l, target: v })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="inline-flex items-center justify-center size-9 shrink-0 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
            aria-label="Remove link"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800"
      >
        <Plus className="size-3.5" />
        Add link
      </button>
    </div>
  );
}

interface CtaValue {
  label: string;
  href: string;
  target?: "_self" | "_blank";
}
function CtaInput({
  value,
  onChange,
}: {
  value: CtaValue | null;
  onChange: (v: CtaValue | null) => void;
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ label: "", href: "", target: "_self" })}
        className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800"
      >
        <Plus className="size-3.5" />
        Add CTA
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="Label"
        value={value.label}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        className={`${inputCls} basis-1/3 shrink-0`}
      />
      <UrlField
        value={value.href}
        onChange={(v) => onChange({ ...value, href: v })}
        className="flex-1 min-w-0"
      />
      <TargetToggle
        value={value.target ?? "_self"}
        onChange={(v) => onChange({ ...value, target: v })}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="inline-flex items-center justify-center size-9 shrink-0 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
        aria-label="Remove CTA"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// Two-icon toggle for the link target. Same-tab (arrow) is selected by
// default; new-tab (external-link icon) flips the link to `_blank` and
// the renderer adds `rel="noopener noreferrer"`.
function TargetToggle({
  value,
  onChange,
}: {
  value: "_self" | "_blank";
  onChange: (v: "_self" | "_blank") => void;
}) {
  const base =
    "size-9 inline-flex items-center justify-center transition cursor-pointer";
  const selected = "bg-emerald-600 text-white";
  const unselected = "text-slate-500 hover:bg-slate-50 hover:text-slate-900";
  return (
    <div
      role="radiogroup"
      aria-label="Link target"
      className="flex shrink-0 rounded-md border border-slate-200 overflow-hidden"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "_self"}
        onClick={() => onChange("_self")}
        title="Open in same tab"
        className={`${base} ${value === "_self" ? selected : unselected}`}
      >
        <ArrowRight className="size-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "_blank"}
        onClick={() => onChange("_blank")}
        title="Open in new tab"
        className={`${base} border-l border-slate-200 ${value === "_blank" ? selected : unselected}`}
      >
        <ExternalLink className="size-4" />
      </button>
    </div>
  );
}

// URL input + content-picker icon button. Used inside link rows where
// every pixel matters — the picker dialog is the same one the heavy
// `ContentLinkInput` uses, just opened from a compact icon button.
function UrlField({
  value,
  onChange,
  className,
  placeholder = "/path or https://…",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`flex gap-1 ${className ?? ""}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} flex-1 min-w-0`}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center justify-center size-9 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition"
        aria-label="Pick a page or post"
        title="Pick a page or post"
      >
        <Search className="size-4" />
      </button>
      <ContentPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(item) => {
          onChange(item.url);
          setOpen(false);
        }}
      />
    </div>
  );
}
