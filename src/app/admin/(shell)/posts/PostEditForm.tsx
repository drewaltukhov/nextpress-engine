"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Crown,
  ExternalLink,
  GitBranch,
  GripVertical,
  Layers,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  PenSquare,
  Plus,
  RotateCcw,
  Tag,
  X,
  User,
  UserCog,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Puck, usePuck, type Data } from "@measured/puck";
import "@measured/puck/dist/index.css";
// Puck blocks are shared with the pages plugin — same authoring surface,
// same render fns, so a post can host the same RichText / Gallery / FAQ /
// Image / Heading library a page can.
import { puckConfig } from "../pages/puck-config";
import { listAllBlocks } from "@core/blocks/registry";
import { WIDGET_ICONS } from "@core/blocks/widget-icons";
import { collectGalleryIds } from "@core-plugins/pages/blocks";
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
import { saveRevisionAction } from "../revisions/actions";
import { useConfirm } from "@core/components/ConfirmDialog";
import type {
  PostDetail,
  PostStatus,
  PostKind,
  PostRobots,
  PillarOption,
} from "@core-plugins/posts";
import type { TopicListItem } from "@core-plugins/topics";

const ROBOTS_OPTIONS: { value: PostRobots; label: string; hint: string }[] = [
  { value: "index,follow", label: "Index, follow", hint: "Default — indexable, links followed" },
  { value: "noindex,follow", label: "No index, follow", hint: "Hidden from search; links still followed" },
  { value: "index,nofollow", label: "Index, no follow", hint: "Indexable; outbound links not endorsed" },
  { value: "noindex,nofollow", label: "No index, no follow", hint: "Fully blocked from search" },
];

const KIND_OPTIONS: { value: PostKind; label: string; hint: string }[] = [
  {
    value: "standalone",
    label: "Standalone",
    hint: "Regular post at /<slug>.",
  },
  {
    value: "pillar",
    label: "Pillar",
    hint: "Topic hub at /<slug>.",
  },
  {
    value: "spike",
    label: "Spike",
    hint: "Lives at /<pillar>/<slug>.",
  },
];

import {
  createPostAction,
  updatePostAction,
  type AuthorOption,
  type AuthorRoleKind,
  type InstalledSchema,
  type PostsPermissions,
} from "./actions";
import type { EditorInspectorPosition } from "../settings/content-actions";
import {
  getPostEditFieldsets,
  type PostEditFieldsetContribution,
} from "@core/admin/post-edit-fieldsets";
// Side-effect import — fires each plugin's admin-contributions.tsx so
// any registered post-edit fieldsets land in the registry before
// `getPostEditFieldsets()` is called below.
import "@generated/plugin-admin-contributions";

interface Props {
  mode: "new" | "edit";
  initial?: PostDetail;
  permissions: PostsPermissions;
  authorOptions: AuthorOption[];
  installedSchemas: InstalledSchema[];
  pillars: PillarOption[];
  topics: TopicListItem[];
  /** Custom Single Post templates from the active theme (standalone + spike kinds). */
  postTemplates: { slug: string; displayName: string }[];
  /** Custom Pillar Post templates from the active theme (pillar kind). */
  pillarTemplates: { slug: string; displayName: string }[];
  inspectorPosition: EditorInspectorPosition;
  /** Whether this post has any saved revisions (shades the History button when false). */
  hasHistory?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

const SUGGESTED_SCHEMA_FOR_POST = "Article";


export function PostEditForm({
  mode,
  initial,
  permissions,
  authorOptions,
  installedSchemas,
  pillars,
  topics,
  postTemplates,
  pillarTemplates,
  inspectorPosition,
  hasHistory = false,
}: Props) {
  const router = useRouter();

  // ── Plugin-contributed fieldsets (Hook 2) ─────────────────────────────
  // Hook-scoped helper hoisted here to keep the save flow readable.
  // Runs every contribution's save() in parallel; collects user-facing
  // error messages so the form can toast them without aborting the post.
  function runContributionSaves(
    contribs: readonly PostEditFieldsetContribution<unknown>[],
    postId: number,
    states: Record<string, unknown>,
  ): Promise<string[]> {
    return Promise.all(
      contribs.map(async (c) => {
        try {
          await c.save(postId, states[c.id]);
          return null;
        } catch (err) {
          return `${c.label}: ${err instanceof Error ? err.message : "save failed"}`;
        }
      }),
    ).then((results) => results.filter((r): r is string => r !== null));
  }

  // Snapshot the registry once on mount; reading it on every render
  // would defeat the registry's globalThis pin.
  const fieldsets = useMemo<readonly PostEditFieldsetContribution<unknown>[]>(
    () => getPostEditFieldsets(),
    [],
  );
  // Plugin-owned state map keyed by contribution id. Initialized to
  // each contribution's `defaultState`; the real values arrive via
  // the async hydration effect below (a contribution's `read` may be
  // async — e.g. when the plugin queries its own table via a server
  // action).
  const [pluginStates, setPluginStates] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fieldsets.map((f) => [f.id, f.defaultState])),
  );
  const setPluginState = useCallback((id: string, next: unknown) => {
    setPluginStates((prev) => ({ ...prev, [id]: next }));
  }, []);

  // Hydrate plugin states from each contribution's `read` once on
  // mount. Synchronous reads resolve immediately; async reads (server
  // actions) settle on the next tick.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        fieldsets.map(async (f) => [f.id, await f.read(initial ?? null)] as const),
      );
      if (cancelled) return;
      setPluginStates((prev) => {
        const next = { ...prev };
        for (const [id, value] of entries) next[id] = value;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // `fieldsets` is snapshotted via useMemo([]) and `initial` is stable
    // for the form's lifetime; this effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const confirmDialog = useConfirm();
  const [pending, startTransition] = useTransition();

  // ── Main fields ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<PostStatus>(initial?.status ?? "draft");

  // ── Pillar / spike taxonomy ────────────────────────────────────────────
  const [postKind, setPostKind] = useState<PostKind>(initial?.postKind ?? "standalone");
  const [parentId, setParentId] = useState<number | null>(initial?.parentId ?? null);
  // ── Template ──────────────────────────────────────────────────────────
  // Kind dictates which customs can be picked: pillar → pillarTemplates
  // (parent_template = single-pillar), else → postTemplates (parent = single-post).
  // The pillar kind takes precedence — switching to/from pillar that
  // invalidates the current selection clears `template` so a non-matching
  // custom never gets saved.
  const [template, setTemplate] = useState<string>(initial?.template ?? "");

  const availableTemplates = postKind === "pillar" ? pillarTemplates : postTemplates;
  const templateBuiltinLabel =
    postKind === "pillar" ? "Default (Pillar Post)" : "Default (Single Post)";

  // Filter the parent picker so a pillar can't pick itself as a parent
  // (would create a cycle and the service layer rejects it anyway).
  const pillarOptionsForPicker = useMemo(
    () => pillars.filter((p) => !initial || p.id !== initial.id),
    [pillars, initial],
  );

  // Switching kind forces parent to be valid:
  //   - non-spike kinds clear parentId entirely
  //   - choosing spike with no parent yet preselects the first available
  //     pillar (best-effort; saving without one will surface a service-
  //     layer error and the user can pick explicitly).
  function handleKindChange(next: PostKind) {
    setPostKind(next);
    if (next !== "spike") {
      setParentId(null);
    } else if (parentId === null && pillarOptionsForPicker.length > 0) {
      setParentId(pillarOptionsForPicker[0].id);
    }
    // Pillar kind takes precedence over a previously-saved template. If
    // the current template's parent no longer matches the new kind's
    // expected parent, clear it so the public render uses the kind's
    // built-in. Compare against the newly-applicable list of customs.
    const nextList = next === "pillar" ? pillarTemplates : postTemplates;
    if (template && !nextList.some((c) => c.slug === template)) {
      setTemplate("");
    }
  }

  // ── Author / date ──────────────────────────────────────────────────────
  const [authorId, setAuthorId] = useState<string>(
    initial?.createdBy ?? permissions.userId ?? "",
  );
  const [postDate, setPostDate] = useState<string>(
    initial?.publishedAt ? toLocalInput(initial.publishedAt) : toLocalInput(new Date().toISOString()),
  );

  // ── Featured image ─────────────────────────────────────────────────────
  // Doubles as og:image fallback when seoOgImage is unset (the public
  // metadata layer handles that resolution). Stored as a URL via the
  // shared MediaPickerInput.
  const [featuredImage, setFeaturedImage] = useState(initial?.featuredImage ?? "");

  // ── Excerpt ────────────────────────────────────────────────────────────
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");

  // ── Topics ─────────────────────────────────────────────────────────────
  const [topicIds, setTopicIds] = useState<number[]>(initial?.topicIds ?? []);

  // ── SEO ────────────────────────────────────────────────────────────────
  const [seoTitleExplicit, setSeoTitleExplicit] = useState(initial?.seoTitle ?? "");
  const [seoTitleDirty, setSeoTitleDirty] = useState(initial?.seoTitle != null);
  const seoTitle = seoTitleDirty ? seoTitleExplicit : title;
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [seoOgImage, setSeoOgImage] = useState(initial?.seoOgImage ?? "");
  const [seoRobots, setSeoRobots] = useState<PostRobots>(initial?.seoRobots ?? "index,follow");
  const [seoExcludeFromSitemap, setSeoExcludeFromSitemap] = useState(
    initial?.seoExcludeFromSitemap ?? false,
  );

  // ── Schemas ────────────────────────────────────────────────────────────
  const [schemaTypes, setSchemaTypes] = useState<string[]>(() => {
    if (initial?.schemaTypes && initial.schemaTypes.length > 0) {
      return initial.schemaTypes;
    }
    if (mode === "new" && installedSchemas.some((s) => s.type === SUGGESTED_SCHEMA_FOR_POST)) {
      return [SUGGESTED_SCHEMA_FOR_POST];
    }
    return [];
  });

  // ── Sidebar / inspector chrome (copied behaviour from PageEditForm) ────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Default compact width for most block types. Selecting a RichText
  // block automatically expands the inspector to a writing-surface
  // width (~720px) via WritingModeController; on exit, the inspector
  // returns to whatever the user had before.
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

  // ── Gallery cache for the WYSIWYG canvas (mirrors Pages flow) ──────────
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

  const galleryApi = useMemo(
    () => ({
      register: (detail: GalleryDetail) =>
        setGalleryCache((prev) => ({ ...prev, [detail.id]: detail })),
      getGallery: (id: number) => galleryCache[id],
    }),
    [galleryCache],
  );

  // ── Unsaved-changes guard ──────────────────────────────────────────────
  function snapshotState() {
    return {
      title,
      slug,
      status,
      postKind,
      parentId,
      template,
      authorId,
      postDate,
      featuredImage,
      excerpt,
      topicIdsKey: JSON.stringify([...topicIds].sort((a, b) => a - b)),
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
      title, status, postKind, parentId, template, authorId, postDate,
      featuredImage, excerpt, topicIds,
      seoTitleExplicit, seoTitleDirty, seoDescription, seoOgImage,
      seoRobots, seoExcludeFromSitemap, schemaTypes,
      contentJson: JSON.stringify(puckData),
    };
  }

  const dirty =
    title !== baseline.title ||
    slug !== baseline.slug ||
    status !== baseline.status ||
    postKind !== baseline.postKind ||
    parentId !== baseline.parentId ||
    template !== baseline.template ||
    authorId !== baseline.authorId ||
    postDate !== baseline.postDate ||
    featuredImage !== baseline.featuredImage ||
    excerpt !== baseline.excerpt ||
    JSON.stringify([...topicIds].sort((a, b) => a - b)) !== baseline.topicIdsKey ||
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

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
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
            "You have unsaved changes on this post. If you leave now, your edits will be lost.",
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

  // Build the public URL preview shown under the slug input. Spikes get
  // the parent pillar's slug prepended; everything else is /<slug>.
  const previewPath = useMemo(() => {
    if (postKind === "spike" && parentId !== null) {
      const parent = pillars.find((p) => p.id === parentId);
      if (parent) return `/${parent.slug}/${previewSlug || "—"}`;
    }
    return `/${previewSlug || "—"}`;
  }, [postKind, parentId, pillars, previewSlug]);

  // ── Save handlers ──────────────────────────────────────────────────────
  function buildSavePayload() {
    const seoTitleToSave = seoTitleDirty ? (seoTitle.trim() || null) : null;
    const seoDescToSave = seoDescription.trim() || null;
    const seoOgToSave = seoOgImage.trim() || null;
    const featuredToSave = featuredImage.trim() || null;
    const excerptToSave = excerpt.trim() || null;
    const postDateToSave = postDate ? new Date(postDate).toISOString() : null;
    return {
      title,
      slug: slug.trim() || undefined,
      excerpt: excerptToSave,
      seoTitle: seoTitleToSave,
      seoDescription: seoDescToSave,
      seoOgImage: seoOgToSave,
      seoRobots,
      seoExcludeFromSitemap,
      schemaTypes,
      authorId,
      postDate: postDateToSave,
      contentJson: JSON.stringify(puckData),
      featuredImage: featuredToSave,
      postKind,
      parentId: postKind === "spike" ? parentId : null,
      topicIds,
      template,
    };
  }

  function handleSave(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (postKind === "spike" && !parentId) {
      toast.error("Spikes need a parent pillar — pick one or change the kind.");
      return;
    }
    const payload = buildSavePayload();

    startTransition(async () => {
      if (mode === "new") {
        const createResult = await createPostAction({
          title: payload.title,
          slug: payload.slug,
          status,
          excerpt: payload.excerpt ?? undefined,
          postKind: payload.postKind,
          parentId: payload.parentId,
          featuredImage: payload.featuredImage,
          schemaTypes: payload.schemaTypes,
          topicIds: permissions.canAssignTopics ? payload.topicIds : undefined,
          template: payload.template,
        });
        if (!createResult.ok) {
          toast.error(createResult.error);
          return;
        }
        if (createResult.id == null) return;

        const followUp = await updatePostAction(createResult.id, {
          contentJson: payload.contentJson,
          createdBy:
            permissions.isAdmin && payload.authorId !== permissions.userId
              ? payload.authorId
              : undefined,
          publishedAt: permissions.canPublish && payload.postDate ? payload.postDate : undefined,
          schemaTypes: payload.schemaTypes,
        });
        if (!followUp.ok) {
          toast.error(followUp.error);
          router.push(`/admin/posts/${createResult.id}/edit`);
          return;
        }

        const seoResult = await callSeoUpdate(createResult.id, payload);
        if (!seoResult.ok) {
          toast.error(seoResult.error);
          router.push(`/admin/posts/${createResult.id}/edit`);
          return;
        }

        // Fan out to each plugin-contributed fieldset so its data is
        // persisted alongside the core post. Failures are surfaced as
        // toasts but don't block the post itself (which already saved).
        const contribErrors = await runContributionSaves(fieldsets, createResult.id, pluginStates);
        for (const err of contribErrors) toast.error(err);

        toast.success(status === "published" ? "Post created and published" : "Post created");
        router.push(`/admin/posts/${createResult.id}/edit`);
        return;
      }

      // ── edit mode ────────────────────────────────────────────────────
      if (!initial) return;

      const statusChanged = status !== initial.status;

      const updateResult = await updatePostAction(initial.id, {
        title: payload.title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        contentJson: payload.contentJson,
        postKind: payload.postKind,
        parentId: payload.parentId,
        featuredImage: payload.featuredImage,
        createdBy:
          permissions.isAdmin && payload.authorId !== initial.createdBy
            ? payload.authorId
            : undefined,
        publishedAt:
          permissions.canPublish && payload.postDate !== (initial.publishedAt ?? null)
            ? payload.postDate
            : undefined,
        schemaTypes: payload.schemaTypes,
        topicIds: permissions.canAssignTopics ? payload.topicIds : undefined,
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

      // Fan out to each plugin-contributed fieldset.
      const contribErrors = await runContributionSaves(fieldsets, initial.id, pluginStates);
      for (const err of contribErrors) toast.error(err);

      if (statusChanged) {
        const { setPostStatusAction } = await import("./actions");
        const statusResult = await setPostStatusAction(initial.id, status);
        if (!statusResult.ok) {
          toast.error(statusResult.error);
          return;
        }
      }

      void saveRevisionAction("post", initial.id, buildRevisionSnapshot());
      setBaseline(snapshotState());
      toast.success("Post saved");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-[100px] z-30 -mx-6 -mt-8 px-6 py-3 mb-6 bg-slate-50/90 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-4">
        <Link
          href="/admin/posts"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to Posts
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
              setStatus(v as PostStatus);
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
            href={previewPath}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={mode === "new" || !previewSlug}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-base shadow-sm transition-colors hover:bg-slate-50 aria-disabled:opacity-40 aria-disabled:pointer-events-none whitespace-nowrap"
          >
            <ExternalLink className="size-4" />
            Preview
          </a>
          <a
            href={mode !== "new" && initial ? `/admin/posts/${initial.id}/history` : undefined}
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
            {pending ? (mode === "new" ? "Creating…" : "Saving…") : (mode === "new" ? "Create post" : "Save")}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          required
          maxLength={200}
          autoFocus={mode === "new"}
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-12 rounded-lg border border-slate-200 bg-white px-4 font-display text-xl tracking-tight text-brand-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
          aria-label="Post title"
        />
      </div>

      <GalleryRegisterContext.Provider value={galleryApi}>
        <Puck
          config={puckConfig}
          data={puckData}
          onChange={handlePuckChange}
          metadata={{ galleries: galleryCache }}
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
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden h-[calc(100vh-7rem)] flex">
                <div className="w-55 shrink-0 border-r border-slate-200 bg-slate-50/40 overflow-y-auto">
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white sticky top-0 z-20">
                    Widgets
                  </div>
                  <div className="p-2">
                    <Puck.Components />
                  </div>
                </div>

                <div className="flex-1 min-w-0 overflow-auto p-6">
                  <article className="mx-auto max-w-3xl prose prose-slate">
                    <Puck.Preview />
                  </article>
                </div>

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

                {/* ─── Publish (kind, parent, slug, author, date) ──────────── */}
                <Card title="Publish" defaultOpen>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="p-template" className="block text-xs font-medium text-slate-500 mb-1">
                        Template
                      </label>
                      <Select value={template} onValueChange={(v) => setTemplate(v ?? "")}>
                        <SelectTrigger id="p-template" className="w-full">
                          <SelectValue placeholder={templateBuiltinLabel}>
                            {(value: string) => {
                              if (!value) return templateBuiltinLabel;
                              const match = availableTemplates.find((c) => c.slug === value);
                              return match?.displayName ?? value;
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">{templateBuiltinLabel}</SelectItem>
                          {availableTemplates.length > 0 ? (
                            <SelectGroup>
                              <SelectLabel>Custom</SelectLabel>
                              {availableTemplates.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>
                                  {c.displayName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                        </SelectContent>
                      </Select>
                      {availableTemplates.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          No custom {postKind === "pillar" ? "Pillar Post" : "Single Post"} templates yet — create one from Themes → Settings → Layout.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Kind</label>
                      <Select
                        value={postKind}
                        onValueChange={(v) => v && handleKindChange(v as PostKind)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(value: string) => {
                              const opt = KIND_OPTIONS.find((o) => o.value === value);
                              if (!opt) return value;
                              return (
                                <span className="inline-flex items-center gap-1.5">
                                  <KindIcon kind={opt.value} />
                                  {opt.label}
                                </span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {KIND_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              disabled={opt.value === "spike" && pillarOptionsForPicker.length === 0}
                            >
                              <div className="flex flex-col">
                                <span className="inline-flex items-center gap-1.5">
                                  <KindIcon kind={opt.value} />
                                  {opt.label}
                                </span>
                                <span className="text-xs text-slate-500">{opt.hint}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {postKind === "spike" && pillarOptionsForPicker.length === 0 && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          No pillars exist yet. Create one first, then assign this post as its spike.
                        </p>
                      )}
                    </div>

                    {postKind === "spike" && pillarOptionsForPicker.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Parent pillar
                        </label>
                        <Select
                          value={parentId !== null ? String(parentId) : ""}
                          onValueChange={(v) => {
                            if (!v) return;
                            setParentId(Number(v));
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pick a pillar">
                              {(value: string) => {
                                if (!value) return <span>Pick a pillar</span>;
                                const p = pillarOptionsForPicker.find(
                                  (opt) => String(opt.id) === value,
                                );
                                if (!p) return value;
                                return (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="font-medium">{p.title}</span>
                                    <span className="text-slate-400 font-mono text-[11px]">
                                      /{p.slug}
                                    </span>
                                  </span>
                                );
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {pillarOptionsForPicker.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{p.title}</span>
                                  <span className="text-[11px] text-slate-500">
                                    /{p.slug}
                                    {p.status === "draft" && (
                                      <span className="ml-1.5 text-amber-700">(draft)</span>
                                    )}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

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
                        Public URL: <code className="font-mono text-slate-700">{previewPath}</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Author</label>
                      {permissions.isAdmin && authorOptions.length > 0 ? (
                        <Select value={authorId} onValueChange={(v) => v && setAuthorId(v)}>
                          <SelectTrigger className="w-full">
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
                            ? "Used when this post is published. Leave blank for current time."
                            : "The public-facing publish timestamp."}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>

                {/* ─── Featured image ─────────────────────────────────────── */}
                <Card title="Featured image" defaultOpen>
                  <MediaPickerInput
                    value={featuredImage}
                    onChange={setFeaturedImage}
                    allowUpload
                    variant="preview"
                  />
                  <p className="mt-2 text-[11px] text-slate-500">
                    Used as the post hero. Also serves as the og:image when the SEO card&apos;s
                    OG image override is empty.
                  </p>
                </Card>

                {/* ─── Excerpt ────────────────────────────────────────────── */}
                <Card title="Excerpt" defaultOpen={false}>
                  <textarea
                    id="p-excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    rows={6}
                    maxLength={500}
                    placeholder="Short summary shown in post listings and feed widgets…"
                    className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {excerpt.length}/500 characters
                  </p>
                </Card>

                {/* ─── Topics ─────────────────────────────────────────────── */}
                <Card title="Topics" defaultOpen={false}>
                  <TopicsPicker
                    topics={topics}
                    value={topicIds}
                    onChange={setTopicIds}
                    canAssign={permissions.canAssignTopics}
                  />
                </Card>

                {/* ─── SEO ────────────────────────────────────────────────── */}
                <Card title="SEO" defaultOpen={false}>
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
                          : "Auto-syncs from the post title."}
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
                        OG / Twitter image
                      </label>
                      <MediaPickerInput
                        value={seoOgImage}
                        onChange={setSeoOgImage}
                        allowUpload
                        variant="preview"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Override for social-share image. Falls back to the featured image when empty.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Robots directive
                      </label>
                      <Select value={seoRobots} onValueChange={(v) => { if (v) setSeoRobots(v as PostRobots); }}>
                        <SelectTrigger className="w-full">
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
                          Per-post override on top of the site-wide Posts toggle.
                        </div>
                      </div>
                      <Switch
                        checked={seoExcludeFromSitemap}
                        onCheckedChange={setSeoExcludeFromSitemap}
                      />
                    </div>
                  </div>
                </Card>

                {/* ─── Schemas ────────────────────────────────────────────── */}
                <Card title="Schemas" defaultOpen={false}>
                  <SchemaPicker
                    installed={installedSchemas}
                    value={schemaTypes}
                    onChange={setSchemaTypes}
                    suggestedType={mode === "new" ? SUGGESTED_SCHEMA_FOR_POST : null}
                    hasFaqBlocks={(puckData.content ?? []).some((b) => b.type === "FAQSection")}
                  />
                </Card>

                {/* ─── Plugin-contributed fieldsets (Hook 2) ───────────── */}
                {fieldsets.map((f) => {
                  const F = f.Component as React.ComponentType<{
                    value: unknown;
                    onChange: (next: unknown) => void;
                    post: PostDetail | null;
                  }>;
                  return (
                    <Card key={f.id} title={f.label} defaultOpen={false}>
                      <F
                        value={pluginStates[f.id]}
                        onChange={(next) => setPluginState(f.id, next)}
                        post={initial ?? null}
                      />
                    </Card>
                  );
                })}
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

function toLocalInput(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function callSeoUpdate(
  postId: number,
  payload: {
    seoTitle: string | null;
    seoDescription: string | null;
    seoOgImage: string | null;
    seoRobots: PostRobots;
    seoExcludeFromSitemap: boolean;
  },
) {
  const { updatePostSeoAction } = await import("./actions");
  return updatePostSeoAction(postId, {
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    seoOgImage: payload.seoOgImage,
    seoRobots: payload.seoRobots,
    seoExcludeFromSitemap: payload.seoExcludeFromSitemap,
  });
}

// ─── Sidebar inspector ──────────────────────────────────────────────────

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

interface SidebarInspectorProps {
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

function SidebarInspector({ width, onResizeStart }: SidebarInspectorProps) {
  const { appState } = usePuck();
  if (!appState.ui.itemSelector) return null;

  return (
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

  const { appState, selectedItem } = usePuck();
  const itemSelector = appState.ui.itemSelector;
  const [prevSelector, setPrevSelector] = useState(itemSelector);
  if (itemSelector !== prevSelector) {
    setPrevSelector(itemSelector);
    if (itemSelector && closed) setClosed(false);
  }
  const visible = itemSelector !== null && !closed;
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

  const positionStyle: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { right: 24, top: 140 };

  return (
    <div
      ref={panelRef}
      style={{
        ...positionStyle,
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

function KindIcon({ kind }: { kind: PostKind }) {
  if (kind === "pillar") return <Layers className="size-3.5 shrink-0 text-indigo-600" />;
  if (kind === "spike") return <GitBranch className="size-3.5 shrink-0 text-sky-600" />;
  return <User className="size-3.5 shrink-0 text-slate-400" />;
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

// ─── Topics picker ───────────────────────────────────────────────────────

interface TopicsPickerProps {
  topics: TopicListItem[];
  value: number[];
  onChange: (next: number[]) => void;
  canAssign: boolean;
}

function TopicsPicker({ topics, value, onChange, canAssign }: TopicsPickerProps) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return topics;
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term),
    );
  }, [topics, search]);

  if (!canAssign) {
    return (
      <p className="text-xs text-slate-500">
        You don&apos;t have permission to assign topics. Ask an admin to grant{" "}
        <code className="font-mono">topics.assign</code>.
      </p>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-sm font-medium text-slate-900">No topics yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Create topics first, then return here to tag this post.
        </p>
        <Link
          href="/admin/topics"
          className="mt-3 inline-flex items-center gap-1 text-xs text-brand-green hover:underline"
        >
          Open Topics
          <ExternalLink className="size-3" />
        </Link>
      </div>
    );
  }

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const t = topics.find((x) => x.id === id);
            if (!t) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-green/10 text-brand-green border border-brand-green/30"
              >
                <Tag className="size-3" />
                {t.name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${t.name}`}
                  className="-mr-1 inline-flex items-center justify-center size-4 rounded-full hover:bg-brand-green/20"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search topics"
        className={inputCls}
      />

      <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">No matches</p>
        ) : (
          filtered.map((t) => {
            const isSelected = selected.has(t.id);
            return (
              <label
                key={t.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition ${
                  isSelected
                    ? "border-brand-green bg-brand-green/5"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(t.id)}
                  className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                />
                <span className="flex-1 text-sm text-slate-900">{t.name}</span>
                <span className="font-mono text-[11px] text-slate-400">/{t.slug}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── FAQ auto-emit hint ──────────────────────────────────────────────────

function FaqAutoHint({ hasFaqBlocks }: { hasFaqBlocks: boolean }) {
  if (!hasFaqBlocks) return null;
  return (
    <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 px-3 py-2 text-xs text-slate-700">
      <span className="font-semibold text-brand-green">FAQPage — Auto.</span>{" "}
      Emitted from this post&apos;s FAQ blocks. No checkbox needed.
    </div>
  );
}

// ─── Schema picker ───────────────────────────────────────────────────────

interface SchemaPickerProps {
  installed: InstalledSchema[];
  value: string[];
  onChange: (next: string[]) => void;
  suggestedType: string | null;
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
        Pick one or more schema.org types to attach to this post&apos;s JSON-LD.
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
