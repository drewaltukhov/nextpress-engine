"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { PanelRight, MoveDiagonal2, FileText, Clock, Tag, BookOpen } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveContentSettings,
  type ContentSettings,
  type EditorInspectorPosition,
  type HomepagePageOption,
  type HomepageTopicOption,
  type HomepagePillarOption,
} from "./content-actions";
import type { HomepageSourceKind } from "@core-plugins/themes/homepage-source-actions";
import {
  getHomepageDisplayOptions,
  setHomepageDisplayOption,
  type HomepageDisplayOptions,
} from "@core-plugins/themes/homepage-display-actions";

interface Props {
  initial: ContentSettings;
  pageOptions: HomepagePageOption[];
  topicOptions: HomepageTopicOption[];
  pillarOptions: HomepagePillarOption[];
}

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface InspectorChoice {
  value: EditorInspectorPosition;
  label: string;
  description: string;
  Icon: typeof PanelRight;
}

const INSPECTOR_CHOICES: InspectorChoice[] = [
  {
    value: "sidebar",
    label: "Sidebar",
    description:
      "Selected-block settings live in a fixed rail to the right of the canvas. Best for typing while watching the canvas update live.",
    Icon: PanelRight,
  },
  {
    value: "floating",
    label: "Floating",
    description:
      "Settings open in a resizable popup over the canvas. Frees up the full editor width — useful on narrow screens.",
    Icon: MoveDiagonal2,
  },
];

interface SourceChoice {
  value: HomepageSourceKind;
  label: string;
  description: string;
  Icon: typeof FileText;
}

const SOURCE_CHOICES: SourceChoice[] = [
  {
    value: "page",
    label: "Static page",
    description: "Render a specific published page at the site root.",
    Icon: FileText,
  },
  {
    value: "recent",
    label: "Recent posts",
    description: "List all published posts, newest first.",
    Icon: Clock,
  },
  {
    value: "topic",
    label: "Topic posts",
    description: "List posts tagged with a specific topic, newest first.",
    Icon: Tag,
  },
  {
    value: "pillar",
    label: "Pillar spikes",
    description: "List spike posts under a specific pillar, newest first.",
    Icon: BookOpen,
  },
];

export function ContentSettingsForm({ initial, pageOptions, topicOptions, pillarOptions }: Props) {
  const [position, setPosition] = useState<EditorInspectorPosition>(
    initial.editorInspectorPosition,
  );
  const [homeSourceKind, setHomeSourceKind] = useState<HomepageSourceKind>(
    initial.homeSourceKind,
  );
  const [homePageId, setHomePageId] = useState<number>(initial.homePageId);
  const [homeTopicId, setHomeTopicId] = useState<number>(initial.homeTopicId);
  const [homePillarId, setHomePillarId] = useState<number>(initial.homePillarId);
  const [disableRightClick, setDisableRightClick] = useState<boolean>(initial.disableRightClick);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveContentSettings({
        editorInspectorPosition: position,
        homeSourceKind,
        homePageId,
        homeTopicId,
        homePillarId,
        disableRightClick,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Content settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Editor inspector position ──────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Editor inspector position</h3>
        <p className="text-xs text-slate-500 mb-4">
          Where the selected-block settings panel renders inside the page and post editor.
        </p>

        <div className="grid grid-cols-1 gap-3" role="radiogroup">
          {INSPECTOR_CHOICES.map((choice) => {
            const isSelected = position === choice.value;
            return (
              <label
                key={choice.value}
                className={`relative flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                  isSelected
                    ? "border-brand-green bg-brand-green/5 ring-1 ring-brand-green/30"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="editor-inspector-position"
                  value={choice.value}
                  checked={isSelected}
                  onChange={() => setPosition(choice.value)}
                  className="sr-only"
                />
                <div
                  className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? "bg-brand-green/10 text-brand-green" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <choice.Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{choice.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{choice.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Homepage source ────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Homepage</h3>
        <p className="text-xs text-slate-500 mb-4">
          Choose what the public homepage (<code className="text-[11px]">/</code>) shows.
        </p>

        <div className="grid grid-cols-1 gap-3 mb-4" role="radiogroup">
          {SOURCE_CHOICES.map((choice) => {
            const isSelected = homeSourceKind === choice.value;
            return (
              <label
                key={choice.value}
                className={`relative flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                  isSelected
                    ? "border-brand-green bg-brand-green/5 ring-1 ring-brand-green/30"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="home-source-kind"
                  value={choice.value}
                  checked={isSelected}
                  onChange={() => setHomeSourceKind(choice.value)}
                  className="sr-only"
                />
                <div
                  className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <choice.Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{choice.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{choice.description}</div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Conditional picker */}
        {homeSourceKind === "page" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">Page</label>
            {pageOptions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No published pages yet. Publish a page first, then come back to pick it here.
              </p>
            ) : (
              <Select
                value={homePageId === 0 ? "__none" : String(homePageId)}
                onValueChange={(v) => setHomePageId(v === "__none" ? 0 : Number(v))}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select a page">
                    {(value) => {
                      if (!value || value === "__none") {
                        return <span className="text-slate-500">— None (show notice)</span>;
                      }
                      const page = pageOptions.find((p) => String(p.id) === value);
                      if (!page) return <span className="text-slate-400">—</span>;
                      return (
                        <>
                          <span className="font-medium">{page.title}</span>
                          <span className="text-slate-400 ml-1">/{page.slug}</span>
                        </>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none">
                    <span className="text-slate-500">— None (show notice)</span>
                  </SelectItem>
                  {pageOptions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="font-medium">{p.title}</span>
                      <span className="text-slate-400 ml-1">/{p.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {homeSourceKind === "recent" && (
          <p className="text-xs text-slate-500">
            Will list all published posts, newest first.
          </p>
        )}

        {homeSourceKind === "topic" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">Topic</label>
            {topicOptions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No topics yet. Create a topic first, then come back to pick it here.
              </p>
            ) : (
              <Select
                value={homeTopicId === 0 ? "__none" : String(homeTopicId)}
                onValueChange={(v) => setHomeTopicId(v === "__none" ? 0 : Number(v))}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select a topic">
                    {(value) => {
                      if (!value || value === "__none") {
                        return <span className="text-slate-500">— None</span>;
                      }
                      const topic = topicOptions.find((t) => String(t.id) === value);
                      if (!topic) return <span className="text-slate-400">—</span>;
                      return (
                        <>
                          <span className="font-medium">{topic.name}</span>
                          <span className="text-slate-400 ml-1">/{topic.slug}</span>
                        </>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none">
                    <span className="text-slate-500">— None</span>
                  </SelectItem>
                  {topicOptions.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="font-medium">{t.name}</span>
                      <span className="text-slate-400 ml-1">/{t.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {homeSourceKind === "pillar" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">Pillar</label>
            {pillarOptions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No published pillars yet. Publish a pillar post first, then come back to pick it
                here.
              </p>
            ) : (
              <Select
                value={homePillarId === 0 ? "__none" : String(homePillarId)}
                onValueChange={(v) => setHomePillarId(v === "__none" ? 0 : Number(v))}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select a pillar">
                    {(value) => {
                      if (!value || value === "__none") {
                        return <span className="text-slate-500">— None</span>;
                      }
                      const pillar = pillarOptions.find((p) => String(p.id) === value);
                      if (!pillar) return <span className="text-slate-400">—</span>;
                      return (
                        <>
                          <span className="font-medium">{pillar.title}</span>
                          <span className="text-slate-400 ml-1">/{pillar.slug}</span>
                        </>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none">
                    <span className="text-slate-500">— None</span>
                  </SelectItem>
                  {pillarOptions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="font-medium">{p.title}</span>
                      <span className="text-slate-400 ml-1">/{p.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* ── Homepage display options ───────────────────────────────────── */}
      {/* Hidden entirely when source is a static page — display options
          don't apply, so the section would be noise. */}
      {homeSourceKind !== "page" && <HomepageDisplaySection />}

      {/* ── Disable right-click ────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Disable right-click</h3>
            <p className="text-xs text-slate-500">
              Suppresses the browser context menu on public pages. A soft deterrent against casual
              copy-paste — savvy visitors can still reach the content via DevTools or view-source,
              so don&apos;t treat this as a security control. Admin routes are not affected.
            </p>
          </div>
          <Switch
            checked={disableRightClick}
            onCheckedChange={setDisableRightClick}
            id="disable-right-click"
          />
        </div>
      </div>

      <div className="lg:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

// ── Homepage display options section ──────────────────────────────────────────

interface RadioOption<T extends string> {
  value: T;
  label: string;
}

const LAYOUT_OPTIONS: RadioOption<HomepageDisplayOptions["layout"]>[] = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
  { value: "plain", label: "Plain" },
];

const GRID_ASPECT_OPTIONS: RadioOption<HomepageDisplayOptions["gridAspect"]>[] = [
  { value: "rectangle", label: "Rectangle" },
  { value: "square", label: "Square" },
];

const PAGINATION_ALIGN_OPTIONS: RadioOption<HomepageDisplayOptions["paginationAlign"]>[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

function InlineRadio<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
              checked
                ? "border-brand-green bg-brand-green/5 font-medium text-brand-green ring-1 ring-brand-green/30"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
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

function HomepageDisplaySection() {
  const [opts, setOpts] = useState<HomepageDisplayOptions | null>(null);

  useEffect(() => {
    let active = true;
    getHomepageDisplayOptions().then((o) => {
      if (active) setOpts(o);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!opts) {
    return (
      <div className={`${cardCls} lg:col-span-2`}>
        <p className="text-sm text-slate-500">Loading display options…</p>
      </div>
    );
  }

  function update<K extends keyof HomepageDisplayOptions>(
    key: K,
    value: HomepageDisplayOptions[K],
  ) {
    setOpts((prev) => (prev ? { ...prev, [key]: value } : prev));
    setHomepageDisplayOption(key, value).then((r) => {
      if (!r.ok) {
        toast.error(r.error);
        getHomepageDisplayOptions().then(setOpts);
      }
    });
  }

  // Two side-by-side cards: post-card layout on the left, pagination
  // on the right. Stacks to a single column under `md` so it still
  // reads on narrow screens. Wrapping <div> spans both columns of the
  // parent settings grid (same as before).
  return (
    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Layout &amp; post cards</h3>
        <p className="text-xs text-slate-500 mb-5">
          How posts arrange on the homepage when source is Recent / Topic / Pillar.
        </p>

        <div className="space-y-5">
          {/* Layout */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">Layout</label>
            <InlineRadio
              name="home-layout"
              options={LAYOUT_OPTIONS}
              value={opts.layout}
              onChange={(v) => update("layout", v)}
            />
          </div>

          {/* Limit */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">
              Posts per page (1–50)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={opts.limit}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n >= 1 && n <= 50) update("limit", n);
              }}
              className={`${inputCls} w-24`}
            />
          </div>

          {/* showThumbnail */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">Show thumbnail</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Display the featured image alongside each post.
              </div>
            </div>
            <Switch
              checked={opts.showThumbnail}
              onCheckedChange={(v) => update("showThumbnail", v)}
            />
          </div>

          {/* showTopic */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">Show topic badge</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Display the primary topic label on each post card.
              </div>
            </div>
            <Switch
              checked={opts.showTopic}
              onCheckedChange={(v) => update("showTopic", v)}
            />
          </div>

          {/* showDate */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">Show date</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Display the published date on each post. Applies to the
                Recent, Topic, and Pillar source kinds.
              </div>
            </div>
            <Switch
              checked={opts.showDate}
              onCheckedChange={(v) => update("showDate", v)}
            />
          </div>

          {/* Grid sub-group */}
          {opts.layout === "grid" && (
            <div className="ml-4 space-y-4 border-l-2 border-slate-100 pl-4">
              {/* gridColumns */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Grid columns</label>
                <Select
                  value={String(opts.gridColumns)}
                  onValueChange={(v) => update("gridColumns", Number(v) as 2 | 3 | 4)}
                >
                  <SelectTrigger className="h-10 text-sm w-40">
                    <SelectValue placeholder="Columns">
                      {(value: string | undefined) => value ?? "—"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 columns</SelectItem>
                    <SelectItem value="3">3 columns</SelectItem>
                    <SelectItem value="4">4 columns</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* gridAspect */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Thumbnail aspect ratio
                </label>
                <InlineRadio
                  name="home-grid-aspect"
                  options={GRID_ASPECT_OPTIONS}
                  value={opts.gridAspect}
                  onChange={(v) => update("gridAspect", v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Pagination</h3>
        <p className="text-xs text-slate-500 mb-5">
          Split results across pages, or show them all at once.
        </p>

        <div className="space-y-5">
          {/* paginationEnabled */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">Enable pagination</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Split results across multiple pages instead of showing all at once.
              </div>
            </div>
            <Switch
              checked={opts.paginationEnabled}
              onCheckedChange={(v) => update("paginationEnabled", v)}
            />
          </div>

          {/* Pagination sub-group */}
          {opts.paginationEnabled && (
            <div className="ml-4 space-y-4 border-l-2 border-slate-100 pl-4">
              {/* paginationStyle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Pagination style
                </label>
                <Select
                  value={opts.paginationStyle}
                  onValueChange={(v) =>
                    update("paginationStyle", v as HomepageDisplayOptions["paginationStyle"])
                  }
                >
                  <SelectTrigger className="h-10 text-sm w-48">
                    <SelectValue placeholder="Style">
                      {(value: string | undefined) =>
                        value === "numbered"
                          ? "Numbered"
                          : value === "arrows"
                            ? "Arrows"
                            : "—"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numbered">Numbered</SelectItem>
                    <SelectItem value="arrows">Arrows</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* paginationType */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Pagination type
                </label>
                <Select
                  value={opts.paginationType}
                  onValueChange={(v) =>
                    update("paginationType", v as HomepageDisplayOptions["paginationType"])
                  }
                >
                  <SelectTrigger className="h-10 text-sm w-48">
                    <SelectValue placeholder="Type">
                      {(value: string | undefined) =>
                        value === "buttons"
                          ? "Buttons"
                          : value === "links"
                            ? "Links"
                            : "—"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buttons">Buttons</SelectItem>
                    <SelectItem value="links">Links</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* paginationAlign */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Pagination alignment
                </label>
                <InlineRadio
                  name="home-pagination-align"
                  options={PAGINATION_ALIGN_OPTIONS}
                  value={opts.paginationAlign}
                  onChange={(v) => update("paginationAlign", v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
