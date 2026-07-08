"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Crown,
  ExternalLink,
  GripVertical,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  PenSquare,
  Plus,
  RotateCcw,
  X,
  User,
  UserCog,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Puck, usePuck, type Data } from "@measured/puck";
import "@measured/puck/dist/index.css";
import { puckConfig } from "./puck-config";
import { collectGalleryIds } from "@core-plugins/pages/blocks";
import { listAllBlocks } from "@core/blocks/registry";
import { WIDGET_ICONS } from "@core/blocks/widget-icons";
import { GalleryRegisterContext } from "@core-plugins/galleries/components/GalleryRegisterContext";
import { getGalleryDetail } from "../media/galleries/actions";
import type { GalleryDetail } from "@core-plugins/galleries";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeSlug } from "@core/slugs/normalize";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@core/components/ConfirmDialog";
import { saveRevisionAction } from "../revisions/actions";
import type { PageDetail, PageStatus, PageRobots } from "@core-plugins/pages";

const ROBOTS_OPTIONS: { value: PageRobots; label: string; hint: string }[] = [
  { value: "index,follow", label: "Index, follow", hint: "Default — indexable, links followed" },
  { value: "noindex,follow", label: "No index, follow", hint: "Hidden from search; links still followed" },
  { value: "index,nofollow", label: "Index, no follow", hint: "Indexable; outbound links not endorsed" },
  { value: "noindex,nofollow", label: "No index, no follow", hint: "Fully blocked from search" },
];
import {
  createPageAction,
  updatePageAction,
  type AuthorOption,
  type AuthorRoleKind,
  type InstalledSchema,
  type PagesPermissions,
} from "./actions";
import type { EditorInspectorPosition } from "../settings/content-actions";

interface Props {
  mode: "new" | "edit";
  /** Required for edit; ignored for new. */
  initial?: PageDetail;
  permissions: PagesPermissions;
  authorOptions: AuthorOption[];
  installedSchemas: InstalledSchema[];
  /** Custom Single Page templates pulled from the active theme. */
  pageTemplates: { slug: string; displayName: string }[];
  /** Site-wide preference: where the selected-block settings panel renders. */
  inspectorPosition: EditorInspectorPosition;
  /** Whether this page has any saved revisions (shades the History button when false). */
  hasHistory?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

const SUGGESTED_SCHEMA_FOR_PAGE = "Article";


export function PageEditForm({
  mode,
  initial,
  permissions,
  authorOptions,
  installedSchemas,
  pageTemplates,
  inspectorPosition,
  hasHistory = false,
}: Props) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [pending, startTransition] = useTransition();

  // ── Main fields ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<PageStatus>(initial?.status ?? "draft");
  const [template, setTemplate] = useState<string>(initial?.template ?? "");

  // ── Author / date ──────────────────────────────────────────────────────
  // For new pages, the actor IS the author until/unless an admin reassigns.
  const [authorId, setAuthorId] = useState<string>(
    initial?.createdBy ?? permissions.userId ?? "",
  );
  // Post date — editable only by publishers. Stored as datetime-local-
  // friendly value (the action layer parses it back to UTC). On a fresh
  // page, default to "now" so the author sees something sensible without
  // hunting for the calendar.
  const [postDate, setPostDate] = useState<string>(
    initial?.publishedAt ? toLocalInput(initial.publishedAt) : toLocalInput(new Date().toISOString()),
  );

  // ── SEO ────────────────────────────────────────────────────────────────
  // Meta title mirrors the main title until the user customizes it. We
  // store the user's explicit value and a "dirty" flag, then derive the
  // displayed value during render — avoids the set-state-in-effect lint
  // rule and is the React-recommended way to mirror props/state.
  const [seoTitleExplicit, setSeoTitleExplicit] = useState(initial?.seoTitle ?? "");
  const [seoTitleDirty, setSeoTitleDirty] = useState(initial?.seoTitle != null);
  const seoTitle = seoTitleDirty ? seoTitleExplicit : title;
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [seoOgImage, setSeoOgImage] = useState(initial?.seoOgImage ?? "");
  const [seoRobots, setSeoRobots] = useState<PageRobots>(initial?.seoRobots ?? "index,follow");
  const [seoExcludeFromSitemap, setSeoExcludeFromSitemap] = useState(
    initial?.seoExcludeFromSitemap ?? false,
  );

  // ── Schemas ────────────────────────────────────────────────────────────
  const [schemaTypes, setSchemaTypes] = useState<string[]>(() => {
    if (initial?.schemaTypes && initial.schemaTypes.length > 0) {
      return initial.schemaTypes;
    }
    // New page default: pre-select Article if it's installed.
    if (mode === "new" && installedSchemas.some((s) => s.type === SUGGESTED_SCHEMA_FOR_PAGE)) {
      return [SUGGESTED_SCHEMA_FOR_PAGE];
    }
    return [];
  });

  // ── Sidebar collapse ───────────────────────────────────────────────────
  // Lets the user reclaim space for the editor canvas. The header buttons
  // (Draft / Save) keep their position regardless — only the body sidebar
  // collapses to a narrow expand-rail.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Sidebar inspector width ────────────────────────────────────────────
  // Width of the right rail that hosts <Puck.Fields /> in sidebar mode.
  // Defaults to 448px (compact, good for most block types). Selecting
  // a RichText block automatically expands the inspector to a writing-
  // surface width (~720px) via WritingModeController; on exit the
  // inspector returns to whatever the user had before.
  const [sidebarInspectorWidth, setSidebarInspectorWidth] = useState(448);
  // Holds the inspector width that was active before entering writing
  // mode, so we can restore it when the user leaves RichText.
  const widthBeforeWritingRef = useRef<number | null>(null);


  const handleWritingModeChange = useCallback((active: boolean) => {
    if (active) {
      setSidebarInspectorWidth((current) => {
        widthBeforeWritingRef.current = current;
        return 720;
      });
      setSidebarOpen(false);
    } else {
      setSidebarInspectorWidth((current) =>
        widthBeforeWritingRef.current ?? current,
      );
      widthBeforeWritingRef.current = null;
      setSidebarOpen(true);
    }
  }, []);

  function handleSidebarInspectorResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarInspectorWidth;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      // Rail is on the right edge — moving the cursor left widens it.
      const delta = startX - ev.clientX;
      const next = Math.max(280, Math.min(960, startWidth + delta));
      setSidebarInspectorWidth(next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Puck content ───────────────────────────────────────────────────────
  // useState with lazy initializer parses the row's stored JSON once on
  // mount and falls back to an empty document. Prefer this over useMemo +
  // useState (the lint rule blocks manual memoization wrapping).
  const [puckData, setPuckData] = useState<Data>(() => {
    if (initial?.contentJson) {
      try {
        const parsed = JSON.parse(initial.contentJson);
        if (parsed && typeof parsed === "object" && "content" in parsed) {
          return parsed as Data;
        }
      } catch {
        // Fall through to empty.
      }
    }
    return { content: [], root: {} };
  });

  // ── Gallery detail cache for the canvas WYSIWYG preview ───────────────
  // The Gallery block's render fn reads gallery details from Puck's
  // metadata. We seed this cache at mount time by fetching every gallery
  // already referenced in the saved puckData; the picker dialog adds new
  // entries as the author swaps galleries. Fresh fetches happen via the
  // GalleryRegisterContext below — each pick triggers a server action so
  // the cache stays current even if the gallery was edited elsewhere.
  const [galleryCache, setGalleryCache] = useState<Record<number, GalleryDetail>>({});
  const [initialGalleryIds] = useState<number[]>(() =>
    collectGalleryIds(puckData.content ?? []),
  );

  useEffect(() => {
    if (initialGalleryIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        initialGalleryIds.map(async (id) => [id, await getGalleryDetail(id)] as const),
      );
      if (cancelled) return;
      setGalleryCache((prev) => {
        const next = { ...prev };
        for (const [id, detail] of entries) {
          if (detail) next[id] = detail;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [initialGalleryIds]);

  // Provide BOTH a register-on-pick callback and a read-from-cache
  // lookup. The picker field uses `getGallery(id)` to render the
  // currently-selected gallery's thumbnail + name when opening a saved
  // page (the cache is seeded by the useEffect above on mount).
  const galleryApi = useMemo(
    () => ({
      register: (detail: GalleryDetail) =>
        setGalleryCache((prev) => ({ ...prev, [detail.id]: detail })),
      getGallery: (id: number) => galleryCache[id],
    }),
    [galleryCache],
  );

  // ── Unsaved-changes guard ──────────────────────────────────────────────
  // Snapshot the form state at mount time (and after each successful save).
  // Anything different from the snapshot = "dirty" → confirm before nav.
  function snapshotState() {
    return {
      title,
      slug,
      status,
      template,
      authorId,
      postDate,
      seoTitleExplicit,
      seoTitleDirty,
      seoDescription,
      seoOgImage,
      seoRobots,
      seoExcludeFromSitemap,
      schemaTypesKey: JSON.stringify(schemaTypes),
      contentJson: JSON.stringify(puckData),
    };
  }
  const [baseline, setBaseline] = useState(snapshotState);

  // Puck fires onChange multiple times on mount (once immediately, then again
  // per async block resolver via resolveAndCommitData). Keep updating baseline
  // for all of those — they're normalization, not user edits. The window closes
  // via setTimeout(0) which runs after all microtask-based resolvers settle.
  const puckNormalizingRef = useRef(true);
  const handlePuckChange = useCallback((data: Data) => {
    setPuckData(data);
    if (puckNormalizingRef.current) {
      setBaseline((b) => ({ ...b, contentJson: JSON.stringify(data) }));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { puckNormalizingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, []);

  function buildRevisionSnapshot() {
    return {
      title, status, template, authorId, postDate,
      seoTitleExplicit, seoTitleDirty, seoDescription, seoOgImage,
      seoRobots, seoExcludeFromSitemap, schemaTypes,
      contentJson: JSON.stringify(puckData),
    };
  }

  const dirty =
    title !== baseline.title ||
    slug !== baseline.slug ||
    status !== baseline.status ||
    template !== baseline.template ||
    authorId !== baseline.authorId ||
    postDate !== baseline.postDate ||
    seoTitleExplicit !== baseline.seoTitleExplicit ||
    seoTitleDirty !== baseline.seoTitleDirty ||
    seoDescription !== baseline.seoDescription ||
    seoOgImage !== baseline.seoOgImage ||
    seoRobots !== baseline.seoRobots ||
    seoExcludeFromSitemap !== baseline.seoExcludeFromSitemap ||
    JSON.stringify(schemaTypes) !== baseline.schemaTypesKey ||
    JSON.stringify(puckData) !== baseline.contentJson;

  useEffect(() => {
    if (!dirty) return;

    // Browser-level navigations (tab close, refresh, address bar, external
    // link in same tab). Modern browsers ignore custom messages and show
    // their own confirmation; setting `returnValue` is enough to trigger it.
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    // Client-side <Link> clicks bypass `beforeunload`. Capture-phase listener
    // intercepts anchor clicks before Next's Link handler runs so the user
    // can cancel the navigation. We skip new-tab clicks and modifier-key
    // clicks (cmd/ctrl/middle) — those don't unload the current page.
    //
    // The branded confirm dialog is async (returns a Promise), but click
    // handlers must decide synchronously whether to call preventDefault.
    // Resolution: always preventDefault on first capture, then await the
    // user's choice; if they confirm, navigate ourselves via router.push
    // (programmatic nav doesn't re-trigger this listener).
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return; // only intercept primary-button clicks
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return; // same-page hash
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      // Same-route anchor (e.g. "/admin/pages/42/edit#section") — ignore.
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const ok = await confirmDialog({
          title: "Unsaved changes",
          description:
            "You have unsaved changes on this page. If you leave now, your edits will be lost.",
          confirmLabel: "Discard & leave",
          cancelLabel: "Keep editing",
          danger: true,
        });
        if (!ok) return;
        if (url.origin === window.location.origin) {
          router.push(url.pathname + url.search + url.hash);
        } else {
          window.location.href = anchor.href;
        }
      })();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [dirty, confirmDialog, router]);

  // ── Derived ────────────────────────────────────────────────────────────
  const previewSlug = useMemo(() => {
    const source = slug.trim() || title;
    return normalizeSlug(source);
  }, [title, slug]);

  // ── Save handlers ──────────────────────────────────────────────────────
  function buildSavePayload() {
    const seoTitleToSave = seoTitleDirty ? (seoTitle.trim() || null) : null;
    const seoDescToSave = seoDescription.trim() || null;
    const seoOgToSave = seoOgImage.trim() || null;
    const postDateToSave = postDate ? new Date(postDate).toISOString() : null;
    return {
      title,
      slug: slug.trim() || undefined,
      seoTitle: seoTitleToSave,
      seoDescription: seoDescToSave,
      seoOgImage: seoOgToSave,
      seoRobots,
      seoExcludeFromSitemap,
      schemaTypes,
      authorId,
      postDate: postDateToSave,
      template,
      contentJson: JSON.stringify(puckData),
    };
  }

  function handleSave(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload = buildSavePayload();

    startTransition(async () => {
      if (mode === "new") {
        const createResult = await createPageAction({
          title: payload.title,
          slug: payload.slug,
          status,
          schemaTypes: payload.schemaTypes,
          template: payload.template,
        });
        if (!createResult.ok) {
          toast.error(createResult.error);
          return;
        }
        if (createResult.id == null) return;

        // Follow up with content + SEO + author + date + schemas in a
        // single updatePageAction so the new page lands in its final state.
        const followUp = await updatePageAction(createResult.id, {
          contentJson: payload.contentJson,
          createdBy: permissions.isAdmin && payload.authorId !== permissions.userId
            ? payload.authorId
            : undefined,
          publishedAt: permissions.canPublish && payload.postDate ? payload.postDate : undefined,
          schemaTypes: payload.schemaTypes,
        });
        if (!followUp.ok) {
          // Page exists but follow-up failed — surface the error and let the
          // user try again from the edit screen.
          toast.error(followUp.error);
          router.push(`/admin/pages/${createResult.id}/edit`);
          return;
        }

        // SEO has its own action (separate validation surface) — fire after
        // the author/date follow-up succeeds.
        const seoResult = await callSeoUpdate(createResult.id, payload);
        if (!seoResult.ok) {
          toast.error(seoResult.error);
          router.push(`/admin/pages/${createResult.id}/edit`);
          return;
        }

        toast.success(status === "published" ? "Page created and published" : "Page created");
        router.push(`/admin/pages/${createResult.id}/edit`);
        return;
      }

      // ── edit mode ────────────────────────────────────────────────────
      if (!initial) return;

      // Status change is its own action — only fire when changed.
      const statusChanged = status !== initial.status;

      const updateResult = await updatePageAction(initial.id, {
        title: payload.title,
        slug: payload.slug,
        contentJson: payload.contentJson,
        createdBy:
          permissions.isAdmin && payload.authorId !== initial.createdBy
            ? payload.authorId
            : undefined,
        publishedAt:
          permissions.canPublish && payload.postDate !== (initial.publishedAt ?? null)
            ? payload.postDate
            : undefined,
        schemaTypes: payload.schemaTypes,
        template:
          payload.template !== (initial.template ?? "") ? payload.template : undefined,
      });
      if (!updateResult.ok) {
        toast.error(updateResult.error);
        return;
      }

      const seoResult = await callSeoUpdate(initial.id, payload);
      if (!seoResult.ok) {
        toast.error(seoResult.error);
        return;
      }

      if (statusChanged) {
        const { setPageStatusAction } = await import("./actions");
        const statusResult = await setPageStatusAction(initial.id, status);
        if (!statusResult.ok) {
          toast.error(statusResult.error);
          return;
        }
      }

      // Capture the just-saved values as the new baseline so the unsaved-
      // changes guard doesn't keep firing while the user keeps editing
      // after a successful save.
      void saveRevisionAction("page", initial.id, buildRevisionSnapshot());
      setBaseline(snapshotState());
      toast.success("Page saved");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-[100px] z-30 -mx-6 -mt-8 px-6 py-3 mb-6 bg-slate-50/90 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-4">
        <Link
          href="/admin/pages"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to Pages
        </Link>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              if (!v) return;
              if (v === "published" && !permissions.canPublish) {
                toast.error("Only publishers can set Published");
                return;
              }
              setStatus(v as PageStatus);
            }}
          >
            <SelectTrigger className="w-[140px] h-10 text-base">
              <SelectValue>
                {(value: string) => (value === "published" ? "Published" : "Draft")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published" disabled={!permissions.canPublish}>
                Published
              </SelectItem>
            </SelectContent>
          </Select>
          <a
            href={`/${previewSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={mode === "new" || !previewSlug}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-base shadow-sm transition-colors hover:bg-slate-50 aria-disabled:opacity-40 aria-disabled:pointer-events-none whitespace-nowrap"
          >
            <ExternalLink className="size-4" />
            Preview
          </a>
          <a
            href={mode !== "new" && initial ? `/admin/pages/${initial.id}/history` : undefined}
            aria-disabled={mode === "new" || !initial || !hasHistory}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-base shadow-sm transition-colors hover:bg-slate-50 aria-disabled:opacity-40 aria-disabled:pointer-events-none whitespace-nowrap"
          >
            <History className="size-4" />
            History
          </a>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || (mode === "edit" && !dirty)}
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-brand-green text-white font-medium text-base shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {pending ? (mode === "new" ? "Creating…" : "Saving…") : (mode === "new" ? "Create page" : "Save")}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          required
          maxLength={200}
          autoFocus={mode === "new"}
          placeholder="Page title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-12 rounded-lg border border-slate-200 bg-white px-4 font-display text-xl tracking-tight text-brand-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
          aria-label="Page title"
        />
      </div>

      <GalleryRegisterContext.Provider value={galleryApi}>
      <Puck
        config={puckConfig}
        data={puckData}
        onChange={handlePuckChange}
        metadata={{ galleries: galleryCache }}
        // Disable Puck's default iframe so the wrapper's bg-white reaches
        // the rendered canvas. We lose CSS isolation between the admin
        // chrome and the rendered blocks; revisit if that becomes an issue
        // (e.g., admin Tailwind resets affecting block typography).
        iframe={{ enabled: false }}
        overrides={{
          drawerItem: ({ children, name }) => {
            const block = listAllBlocks().find((b) => b.name === name);
            const customIcon = block?.icon;
            const LucideIcon = WIDGET_ICONS[name];
            return (
              <div className="flex items-center gap-2 pl-1">
                {customIcon ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  >
                    <path d={customIcon} />
                  </svg>
                ) : LucideIcon ? (
                  <LucideIcon
                    className="size-3.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">{children}</div>
              </div>
            );
          },
        }}
      >
      <WritingModeController
        enabled={inspectorPosition === "sidebar"}
        onWritingModeChange={handleWritingModeChange}
      />
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Editor fills the viewport height minus the breadcrumb + title
              row above so the canvas feels "full screen" while editing.
              Each inner rail has its own overflow so they scroll independently. */}
          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden h-[calc(100vh-7rem)] flex">
            {/* Widget library — narrow rail. Scrolls independently when long. */}
            <div className="w-55 shrink-0 border-r border-slate-200 bg-slate-50/40 overflow-y-auto">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white sticky top-0 z-20">
                Widgets
              </div>
              <div className="p-2">
                <Puck.Components />
              </div>
            </div>

            {/* Canvas — outer scroller fills the remaining width. The
                inner article mirrors the public route's container
                (`mx-auto max-w-3xl prose prose-slate`) so WYSIWYG holds
                on wide monitors: full-bleed blocks like Gallery and
                YouTube stay capped to the same reading width the
                visitor will see, instead of stretching across the
                whole canvas. */}
            <div className="flex-1 min-w-0 overflow-auto p-6">
              <article className="mx-auto max-w-3xl prose prose-slate">
                <Puck.Preview />
              </article>
            </div>

            {/* Selected-block fields — sidebar mode only. In floating mode
                the panel renders below as a movable popup. The width is
                user-resizable via the drag handle on the left edge. Hidden
                until the user selects a block (mirrors floating behavior).*/}
            {inspectorPosition === "sidebar" && (
              <SidebarInspector
                width={sidebarInspectorWidth}
                onResizeStart={handleSidebarInspectorResize}
              />
            )}
          </div>
        </div>

        {sidebarOpen ? (
          <div className="w-[300px] shrink-0 space-y-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500 shadow-sm transition-colors hover:text-slate-900 hover:border-slate-300"
            >
              <PanelRightClose className="size-3.5" />
              Hide sidebar
            </button>
          {/* ─── Publish ──────────────────────────────────────────────── */}
          <Card title="Publish" defaultOpen>
            <div className="space-y-4">
              <div>
                <label htmlFor="p-template" className="block text-xs font-medium text-slate-500 mb-1">
                  Template
                </label>
                <Select value={template} onValueChange={(v) => setTemplate(v ?? "")}>
                  <SelectTrigger id="p-template" className="w-full">
                    <SelectValue placeholder="Default (Single Page)">
                      {(value: string) => {
                        if (!value) return "Default (Single Page)";
                        const match = pageTemplates.find((c) => c.slug === value);
                        return match?.displayName ?? value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default (Single Page)</SelectItem>
                    {pageTemplates.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Custom</SelectLabel>
                        {pageTemplates.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>
                            {c.displayName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
                {pageTemplates.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    No custom Single Page templates yet — create one from Themes → Settings → Layout.
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="p-slug" className="block text-xs font-medium text-slate-500 mb-1">
                  Slug
                </label>
                <input
                  id="p-slug"
                  type="text"
                  maxLength={200}
                  placeholder="Auto from title"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Public URL: <code className="font-mono text-slate-700">/{previewSlug || "—"}</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Author</label>
                {permissions.isAdmin && authorOptions.length > 0 ? (
                  <Select value={authorId} onValueChange={(v) => v && setAuthorId(v)}>
                    <SelectTrigger className="w-full">
                      {/* base-ui's SelectValue renders the raw `value` by
                          default; pass children to map id → displayName +
                          role icon so the trigger shows the human-readable
                          name with a clear role indicator. */}
                      <SelectValue>
                        {(value: string) => {
                          const u = authorOptions.find((opt) => opt.id === value);
                          if (!u) return value;
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <RoleIcon kind={u.roleKind} />
                              {u.displayName}
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {authorOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <RoleIcon kind={u.roleKind} />
                            {u.displayName}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-slate-700">
                    {initial?.authorDisplayName ?? "You"}
                  </div>
                )}
              </div>

              {permissions.canPublish && (
                <div>
                  <label htmlFor="p-postdate" className="block text-xs font-medium text-slate-500 mb-1">
                    Post date
                  </label>
                  <input
                    id="p-postdate"
                    type="datetime-local"
                    value={postDate}
                    onChange={(e) => setPostDate(e.target.value)}
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {status === "draft"
                      ? "Used when this page is published. Leave blank for current time."
                      : "The public-facing publish timestamp."}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ─── SEO ─────────────────────────────────────────────────── */}
          <Card title="SEO" defaultOpen>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="p-seo-title" className="block text-xs font-medium text-slate-500">
                    Meta title
                  </label>
                  {seoTitleDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setSeoTitleDirty(false);
                        setSeoTitleExplicit("");
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-brand-green hover:underline"
                    >
                      <RotateCcw className="size-3" />
                      Sync with title
                    </button>
                  )}
                </div>
                <input
                  id="p-seo-title"
                  type="text"
                  maxLength={200}
                  value={seoTitle}
                  onChange={(e) => {
                    setSeoTitleExplicit(e.target.value);
                    setSeoTitleDirty(true);
                  }}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {seoTitleDirty
                    ? "Customized — will not auto-update with the title."
                    : "Auto-syncs from the page title."}
                </p>
              </div>

              <div>
                <label htmlFor="p-seo-desc" className="block text-xs font-medium text-slate-500 mb-1">
                  Meta description
                </label>
                <textarea
                  id="p-seo-desc"
                  rows={6}
                  maxLength={500}
                  placeholder="One or two sentences for search results."
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Featured image
                </label>
                <MediaPickerInput
                  value={seoOgImage}
                  onChange={setSeoOgImage}
                  allowUpload
                  variant="preview"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Used as the page hero and the og:image when shared on social platforms.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Robots directive
                </label>
                <Select value={seoRobots} onValueChange={(v) => { if (v) setSeoRobots(v as PageRobots); }}>
                  <SelectTrigger className="w-full">
                    {/* base-ui SelectValue defaults to the raw value string;
                        map id → human label so the trigger shows e.g.
                        "Index, follow" instead of "index,follow". */}
                    <SelectValue>
                      {(value: string) => {
                        const opt = ROBOTS_OPTIONS.find((o) => o.value === value);
                        return opt ? opt.label : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROBOTS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-slate-500">{opt.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-700">
                    Exclude from sitemap
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Per-page override on top of the site-wide Pages toggle.
                  </div>
                </div>
                <Switch
                  checked={seoExcludeFromSitemap}
                  onCheckedChange={setSeoExcludeFromSitemap}
                />
              </div>
            </div>
          </Card>

          {/* ─── Schemas ─────────────────────────────────────────────── */}
          <Card title="Schemas" defaultOpen={false}>
            <SchemaPicker
              installed={installedSchemas}
              value={schemaTypes}
              onChange={setSchemaTypes}
              suggestedType={mode === "new" ? SUGGESTED_SCHEMA_FOR_PAGE : null}
              hasFaqBlocks={(puckData.content ?? []).some((b) => b.type === "FAQSection")}
            />
          </Card>
          </div>
        ) : (
          <div className="w-10 shrink-0 flex flex-col items-center pt-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Show sidebar"
              title="Show sidebar"
              className="size-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-900 hover:border-slate-300"
            >
              <PanelRightOpen className="size-4" />
            </button>
          </div>
        )}
      </div>

      {inspectorPosition === "floating" && (
        <FloatingInspector>
          <Puck.Fields />
        </FloatingInspector>
      )}
      </Puck>
      </GalleryRegisterContext.Provider>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * `published_at` is stored as a UTC ISO string. `<input type="datetime-local">`
 * wants `YYYY-MM-DDTHH:mm` in the browser's local time. Round-trip through
 * Date so the input shows what the user expects in their timezone.
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function callSeoUpdate(
  pageId: number,
  payload: {
    seoTitle: string | null;
    seoDescription: string | null;
    seoOgImage: string | null;
    seoRobots: PageRobots;
    seoExcludeFromSitemap: boolean;
  },
) {
  const { updatePageSeoAction } = await import("./actions");
  return updatePageSeoAction(pageId, {
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    seoOgImage: payload.seoOgImage,
    seoRobots: payload.seoRobots,
    seoExcludeFromSitemap: payload.seoExcludeFromSitemap,
  });
}

// ─── Writing-mode controller ─────────────────────────────────────────────
// Mounted as a child of <Puck> so it can read `selectedItem` via usePuck.
// Fires `onWritingModeChange(true)` when a RichText block becomes
// selected, and `(false)` when leaving it (or selecting any other type).
// Parent uses this to swap the inspector into a writing-surface layout
// (wide, with the right metadata sidebar collapsed) and restore on exit.
//
// Only acts on selection-type CHANGES, so it doesn't fight a user who
// manually adjusts inspector width or re-opens the sidebar in the
// middle of editing.

interface WritingModeControllerProps {
  enabled: boolean;
  onWritingModeChange: (active: boolean) => void;
}

function WritingModeController({ enabled, onWritingModeChange }: WritingModeControllerProps) {
  const { selectedItem } = usePuck();
  const isRichText = selectedItem?.type === "RichText";
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (prevRef.current === isRichText) return;
    prevRef.current = isRichText;
    onWritingModeChange(isRichText);
  }, [enabled, isRichText, onWritingModeChange]);
  return null;
}

// ─── Sidebar inspector ──────────────────────────────────────────────────
//
// Right-rail panel hosting <Puck.Fields /> when inspector mode = sidebar.
// Hidden until the user selects a block — `usePuck` only works inside the
// <Puck> provider, so this has to live in its own component.

interface SidebarInspectorProps {
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function SidebarInspector({ width, onResizeStart }: SidebarInspectorProps) {
  const { appState } = usePuck();
  if (!appState.ui.itemSelector) return null;

  return (
    // `overflow-x-clip` (or hidden) on the inspector itself prevents
    // wide field content from escaping the sidebar's right edge — until
    // it's clipped, no element has actual overflow, so no scroll
    // wrapper inside any custom field can do its job. With clipping in
    // place, fields that need horizontal scroll (the table builder) can
    // own their own scroll wrapper and behave correctly.
    <div
      style={{ width }}
      className="relative shrink-0 border-l border-slate-200 bg-slate-50/40 overflow-y-auto overflow-x-clip"
    >
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-brand-green/40 active:bg-brand-green/60 transition-colors z-10"
        aria-label="Resize Widget Settings panel"
        role="separator"
        aria-orientation="vertical"
      />
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white sticky top-0 z-20">
        Widget Settings
      </div>
      <div className="p-2 min-w-0">
        <Puck.Fields />
      </div>
    </div>
  );
}

// ─── Floating inspector ─────────────────────────────────────────────────
//
// Renders Puck.Fields inside a movable + resizable popup so the canvas can
// use the full editor width. Position-fixed at the viewport level. Drag via
// the header strip; resize via the native bottom-right handle (CSS
// `resize: both`).
//
// On the resize: the browser writes the new width/height to the element's
// inline style itself. We DO NOT mirror that back into React state — an
// earlier ResizeObserver-based mirror caused a feedback loop where
// `contentRect` (inner box) was ~2px smaller than the border-box width
// React kept setting, so each observer fire shrank the panel until it was
// 0x0. Letting the browser own size after the initial render is enough:
// React's reconciler skips style.width/height updates when the state value
// hasn't changed, so the user's native resize sticks across drag re-renders.
//
// One unscientific magic number: the initial `right: 24, top: 140` places
// the panel under the breadcrumb + title row in most viewport sizes — once
// the user drags, those defaults stop mattering.

interface FloatingInspectorProps {
  children: React.ReactNode;
}

function FloatingInspector({ children }: FloatingInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState(false);

  // Visibility is driven by Puck's selection: nothing selected = nothing to
  // edit, so the panel hides. Any new selection re-opens it (overriding a
  // prior X-close). We track the previous selector value in state to
  // perform the comparison and `setClosed` during render — the React-
  // recommended pattern for "adjusting state when a prop/external value
  // changes" (https://react.dev/learn/you-might-not-need-an-effect#
  // adjusting-state-when-a-prop-changes).
  const { appState, selectedItem } = usePuck();
  const itemSelector = appState.ui.itemSelector;
  const [prevSelector, setPrevSelector] = useState(itemSelector);
  if (itemSelector !== prevSelector) {
    setPrevSelector(itemSelector);
    if (itemSelector && closed) setClosed(false);
  }
  const visible = itemSelector !== null && !closed;
  // Header label: show the selected component's name (e.g. "RichText",
  // "Heading"). Fallback covers the brief frame between Puck's selector
  // updating and `selectedItem` resolving.
  const headerLabel = selectedItem?.type ?? "Widget Settings";

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startLeft: pos?.left ?? rect.left,
      startTop: pos?.top ?? rect.top,
    };

    function onMove(ev: MouseEvent) {
      const s = dragStartRef.current;
      if (!s) return;
      // Clamp to keep the panel grab handle reachable. 8px from each edge
      // and at least the header height (~36px) visible.
      const maxLeft = window.innerWidth - 64;
      const maxTop = window.innerHeight - 36;
      const left = Math.max(8, Math.min(maxLeft, s.startLeft + (ev.clientX - s.pointerX)));
      const top = Math.max(8, Math.min(maxTop, s.startTop + (ev.clientY - s.pointerY)));
      setPos({ left, top });
    }
    function onUp() {
      dragStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Mirror the panel's measured content height to a CSS custom property so
  // descendant editors (RichTextEditor) can grow with the panel. Writing
  // directly to the DOM avoids any React state churn and the loop hazards
  // we hit earlier with width/height mirroring. `borderBoxSize` is the same
  // metric we set via inline width/height, so the calc is consistent.
  // Header is ~36px, content padding is p-2 (8px top/bottom = 16px).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0];
        if (!box) continue;
        const innerH = Math.max(0, Math.round(box.blockSize) - 36 - 16);
        el.style.setProperty("--inspector-content-h", `${innerH}px`);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Untouched: anchor to top-right with a comfortable offset.
  // After first drag: top-left coordinates take over.
  const positionStyle: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { right: 24, top: 140 };

  // `visible` is computed near the top of the component (right after the
  // selection-tracking block). Hide via display:none rather than unmounting
  // so the user's natively-resized inline width/height stays on the DOM
  // node and the panel pops back at the same size + position the next time
  // it's shown.

  return (
    <div
      ref={panelRef}
      style={{
        ...positionStyle,
        // Initial size only — browser owns these after the user resizes,
        // and we never write them back from React.
        width: 320,
        height: collapsed ? undefined : 480,
        minWidth: 240,
        minHeight: collapsed ? undefined : 200,
        display: visible ? undefined : "none",
      }}
      className={`fixed z-50 flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden ${
        collapsed ? "" : "resize"
      }`}
    >
      <div
        onMouseDown={handleDragStart}
        className="flex shrink-0 cursor-move select-none items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <GripVertical className="size-3.5 text-slate-400" />
          {headerLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
            aria-label={collapsed ? "Expand" : "Collapse"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setClosed(true)}
            className="inline-flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
            aria-label="Close"
            title="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
      )}
    </div>
  );
}

// ─── Role icon ───────────────────────────────────────────────────────────

const ROLE_ICON_META: Record<AuthorRoleKind, { Icon: typeof Crown; label: string; cls: string }> = {
  admin: { Icon: Crown, label: "Admin", cls: "text-amber-600" },
  editor: { Icon: PenSquare, label: "Editor", cls: "text-brand-green" },
  author: { Icon: PenLine, label: "Author", cls: "text-blue-600" },
  custom: { Icon: UserCog, label: "Custom role", cls: "text-purple-600" },
  none: { Icon: User, label: "No role", cls: "text-slate-400" },
};

function RoleIcon({ kind }: { kind: AuthorRoleKind }) {
  const meta = ROLE_ICON_META[kind];
  return (
    <meta.Icon className={`size-3.5 shrink-0 ${meta.cls}`} aria-label={meta.label} />
  );
}

// ─── Card ────────────────────────────────────────────────────────────────

interface CardProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Card({ title, defaultOpen = true, children }: CardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50/80 transition-colors"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={`size-4 text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

// ─── FAQ auto-emit hint ──────────────────────────────────────────────────
//
// Renders inside the Schemas card when the page contains at least one
// FAQSection block. The chip is informational — FAQPage is auto-emitted
// from block content at render time, so the user can't uncheck it.
function FaqAutoHint({ hasFaqBlocks }: { hasFaqBlocks: boolean }) {
  if (!hasFaqBlocks) return null;
  return (
    <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 px-3 py-2 text-xs text-slate-700">
      <span className="font-semibold text-brand-green">FAQPage — Auto.</span>{" "}
      Emitted from this page&apos;s FAQ blocks. No checkbox needed.
    </div>
  );
}

// ─── Schema picker ───────────────────────────────────────────────────────

interface SchemaPickerProps {
  installed: InstalledSchema[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Type to label as "Suggested" — pre-selected on new page creation. */
  suggestedType: string | null;
  /** True when the page contains at least one FAQSection Puck block. */
  hasFaqBlocks: boolean;
}

function SchemaPicker({ installed, value, onChange, suggestedType, hasFaqBlocks }: SchemaPickerProps) {
  if (installed.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-sm font-medium text-slate-900">No schemas installed</p>
          <p className="mt-1 text-xs text-slate-500">
            Add some on the SEO admin&apos;s Install Schemas tab.
          </p>
          <Link
            href="/admin/seo"
            className="mt-3 inline-flex items-center gap-1 text-xs text-brand-green hover:underline"
          >
            Open SEO settings
            <ExternalLink className="size-3" />
          </Link>
        </div>
        <FaqAutoHint hasFaqBlocks={hasFaqBlocks} />
      </div>
    );
  }

  const selected = new Set(value);

  function toggle(type: string) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Pick one or more schema.org types to attach to this page&apos;s JSON-LD.
      </p>
      <FaqAutoHint hasFaqBlocks={hasFaqBlocks} />
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
        {installed.map((s) => {
          const isSelected = selected.has(s.type);
          const isSuggested = suggestedType === s.type;
          return (
            <label
              key={s.type}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition ${
                isSelected
                  ? "border-brand-green bg-brand-green/5"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(s.type)}
                className="mt-0.5 size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  {s.name}
                  {isSuggested && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded">
                      Suggested
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
