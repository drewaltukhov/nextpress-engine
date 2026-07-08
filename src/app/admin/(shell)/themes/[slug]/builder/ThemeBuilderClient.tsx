"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GalleryRegisterContext,
  type GalleryRegisterApi,
} from "@core-plugins/galleries/components/GalleryRegisterContext";
import type { GalleryDetail } from "@core-plugins/galleries";
import { getGalleryDetail } from "../../../media/galleries/actions";
import {
  ArrowLeft,
  Layers,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Save,
} from "lucide-react";
import { WIDGET_ICONS } from "@core/blocks/widget-icons";
import { toast } from "sonner";
import { Puck, DropZone, type Config, type Data } from "@measured/puck";
import "@measured/puck/dist/index.css";
import { useConfirm } from "@core/components/ConfirmDialog";
// Side-effect imports: every block surface the builder might show MUST
// also be registered in the CLIENT bundle. The server registry is built
// during boot via the plugin loader; the client gets nothing unless we
// import the registration files explicitly. Skipping any of these:
//   - "No configuration for <BlockName>" warnings from Puck for those blocks
//   - widget rail differs between SSR and CSR -> hydration mismatch
import "@core-plugins/pages/blocks";
import "@core-plugins/menus/blocks";
import "@core-plugins/site-widgets";
import "@generated/plugin-blocks";
import {
  getBlocksForSurface,
  listAllBlocks,
  decorateComponents,
  type RegisteredBlock,
  type Surface,
} from "@core/blocks/registry";
import type {
  ThemeListItem,
  ThemeDataValue,
  ThemeDataKind,
} from "@core-plugins/themes";
import {
  CLONEABLE_TEMPLATE_IDS,
  TEMPLATE_LABELS as BUILT_IN_TEMPLATE_LABELS,
  surfaceForTemplate,
  type TemplateId as BuiltInTemplateId,
} from "@core-plugins/themes/templates";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveThemeDataAction, resetThemeDataAction, revalidateThemePathsAction, type SaveResult } from "../../actions";
import { saveThemeSettingAction } from "../settings/actions";

// ─── Layout model ──────────────────────────────────────────────────────────
//
// The builder renders a single Puck instance per active template. The root
// render lays out a schematic page (Header / [LSidebar | Main | RSidebar] /
// Footer) using Puck DropZones. Each zone is a real drop target backed by
// data.zones; on save the active template's main zone goes to the matching
// `template` row in theme_data, while the four other zones go to the four
// shared `part` rows. Switching templates only reloads the Main zone — the
// shared parts persist across template tabs.

type TemplateId =
  | "homepage"
  | "single-page"
  | "single-post"
  | "single-pillar"
  | "topic-archive"
  | "not-found"
  | "search-results"
  | "author";

interface TemplateDef {
  id: TemplateId;
  label: string;
  surface: Surface;
}

const TEMPLATES: TemplateDef[] = [
  { id: "homepage", label: "Homepage", surface: "template-homepage" },
  { id: "single-page", label: "Single Page", surface: "template-single-page" },
  { id: "single-post", label: "Single Post", surface: "template-single-post" },
  { id: "single-pillar", label: "Pillar Post", surface: "template-single-pillar" },
  { id: "topic-archive", label: "Topic Archive", surface: "template-topic-archive" },
  { id: "search-results", label: "Search Results", surface: "template-search-results" },
  { id: "author", label: "Author Profile", surface: "template-author" },
  { id: "not-found", label: "404 Not Found", surface: "template-not-found" },
];

interface ZoneDef {
  /** Puck zone id (matches the `zone` prop on DropZone). */
  zone: string;
  label: string;
  /** Theme_data row identity. For the main zone this is filled in
   *  per-template at runtime. */
  kind: ThemeDataKind;
  /** Theme_data row name. For the main zone this is the active template id. */
  name: string;
  surface: Surface;
}

const FIXED_ZONES: ZoneDef[] = [
  { zone: "header",         label: "Header",         kind: "part", name: "header",         surface: "header" },
  { zone: "left-sidebar",   label: "Left Sidebar",   kind: "part", name: "left-sidebar",   surface: "sidebar" },
  { zone: "right-sidebar",  label: "Right Sidebar",  kind: "part", name: "right-sidebar",  surface: "sidebar" },
  { zone: "footer",         label: "Footer",         kind: "part", name: "footer",         surface: "footer" },
];

const MAIN_ZONE = "main" as const;

export type SidebarVisibility = Record<string, { left: boolean; right: boolean }>;

/** Per-template, per-side opt-in flag for custom sidebars. When the
 *  flag is true the public renderer (and this builder) reads/writes
 *  the per-template sidebar part (`(left|right)-sidebar:<templateId>`)
 *  instead of the shared default. False everywhere → status quo. */
export type CustomSidebarFlags = Record<string, { left: boolean; right: boolean }>;

/** Custom template descriptor — sent down from the server page so the
 *  builder knows which user-defined templates exist alongside the built-ins. */
export interface CustomTemplateDescriptor {
  slug: string;
  displayName: string;
  parentTemplate: string;
}

interface Props {
  theme: ThemeListItem;
  savedRows: ThemeDataValue[];
  sidebarVisibility: SidebarVisibility;
  customSidebarFlags: CustomSidebarFlags;
  /** Custom templates for this theme. Empty array when the theme has none. */
  customs: CustomTemplateDescriptor[];
  /** Site logo URL pulled from `theme.<slug>.logo_media_id`. The
   *  builder forwards this to Puck via `metadata.themeLogoUrl` so the
   *  SiteLogo block renders the same image in the editor preview as
   *  the live page (and the theme settings page). Single source of
   *  truth. */
  themeLogoUrl: string;
}

// Tailwind purge needs each col-span class to appear as a literal
// somewhere it can scan. Lookup keeps the candidate set explicit.
const MAIN_SPAN_CLASS: Record<2 | 3 | 4, string> = {
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
};

export function ThemeBuilderClient({
  theme,
  savedRows,
  sidebarVisibility,
  customSidebarFlags,
  themeLogoUrl,
  customs,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [activeTemplateId, setActiveTemplateId] = useState<string>("homepage");
  const [pending, startTransition] = useTransition();
  const [visibility, setVisibility] = useState<SidebarVisibility>(sidebarVisibility);
  // Defensive `?? { left: true, right: true }` — custom templates seeded into
  // visibility/customMode via the server page initializer should always have
  // entries, but if a custom is added mid-session before the page reloads,
  // fall back to sensible defaults rather than crashing. Memoized so that
  // dependent useMemos don't churn on every render when the fallback fires.
  const activeVisibility = useMemo(
    () => visibility[activeTemplateId] ?? { left: true, right: true },
    [visibility, activeTemplateId],
  );


  // One source of truth for every zone. `parts` is shared across all
  // template tabs; `templateMains` keeps a per-template content array.
  const [parts, setParts] = useState<Record<string, ContentArray>>(() =>
    loadPartsContent(savedRows),
  );
  const [templateMains, setTemplateMains] = useState<Record<string, ContentArray>>(() =>
    loadTemplateMainsContent(savedRows, customs),
  );
  // Nested DropZone data. Blocks like StickyContainer host their own
  // zones — keyed `<blockId>:<zoneName>`. Puck's `<Render>` looks them
  // up off `data.zones` at render time, so we must round-trip them
  // through save/load just like the top-level part content. They're
  // partitioned by the part / template they live under so each saved
  // theme_data row stays self-contained (the public renderer fetches
  // each part separately).
  const [partZones, setPartZones] = useState<Record<string, Record<string, ContentArray>>>(() =>
    loadPartsZones(savedRows),
  );
  const [templateZones, setTemplateZones] = useState<Record<string, Record<string, ContentArray>>>(() =>
    loadTemplateMainsZones(savedRows, customs),
  );

  // Per-template sidebar overrides. Mirrors the shape of the shared
  // sidebar parts but stores one entry per (templateId, side). The
  // saved rows are indexed by `(left|right)-sidebar:<templateId>` —
  // the loader below splits them apart on initial mount. When a
  // template's `customMode[tid][side]` is on, the schematic edits
  // these buckets instead of the shared `parts["(left|right)-sidebar"]`.
  const [customMode, setCustomMode] = useState<CustomSidebarFlags>(customSidebarFlags);
  const [customSidebars, setCustomSidebars] = useState<{
    left: Record<string, ContentArray>;
    right: Record<string, ContentArray>;
  }>(() => loadCustomSidebarsContent(savedRows, customs));
  const [customSidebarZones, setCustomSidebarZones] = useState<{
    left: Record<string, Record<string, ContentArray>>;
    right: Record<string, Record<string, ContentArray>>;
  }>(() => loadCustomSidebarsZones(savedRows, customs));

  // Granular dirty tracking — the save button only fires actions for
  // the buckets that actually changed in this session. Without this,
  // every save would unconditionally write all 5 fixed rows (header,
  // two sidebars, footer, active template main) plus optional sidebar
  // overrides — 5+ DB round-trips, 5+ audit_log inserts, and 10+
  // redundant revalidatePath calls for what's usually a single-zone
  // edit. Per-part vs per-template split mirrors the save action's own
  // dispatch shape so each entry lines up 1:1 with a `saveThemeData`
  // call below.
  const [dirtyParts, setDirtyParts] = useState<Set<string>>(() => new Set());
  const [dirtyTemplates, setDirtyTemplates] = useState<Set<string>>(() => new Set());
  // When a side of the active template's custom override has been
  // touched (seeded or edited) during this session, we save its row
  // even when its content array is `[]` — that way an explicit
  // "empty sidebar for this template" stays empty across reloads
  // instead of falling back to shared. Reset when navigating away or
  // saving.
  const [customDirty, setCustomDirty] = useState<{
    left: Set<string>;
    right: Set<string>;
  }>({ left: new Set(), right: new Set() });
  const dirty =
    dirtyParts.size > 0 ||
    dirtyTemplates.size > 0 ||
    customDirty.left.size > 0 ||
    customDirty.right.size > 0;
  const markPartDirty = (name: string) => {
    setDirtyParts((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };
  const markTemplateDirty = (id: string) => {
    setDirtyTemplates((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const activeMode = customMode[activeTemplateId] ?? { left: false, right: false };
  // Memoised so `useMemo` consumers below see a stable reference when
  // nothing relevant changed — without this, every render produces a
  // fresh `?? []` / `?? {}` array/object and the downstream memos
  // (`puckData`, `presentBlockNames`) rebuild needlessly.
  const activeLeftSidebar = useMemo<ContentArray>(
    () =>
      activeMode.left
        ? customSidebars.left[activeTemplateId] ?? []
        : parts["left-sidebar"] ?? [],
    [activeMode.left, customSidebars.left, parts, activeTemplateId],
  );
  const activeRightSidebar = useMemo<ContentArray>(
    () =>
      activeMode.right
        ? customSidebars.right[activeTemplateId] ?? []
        : parts["right-sidebar"] ?? [],
    [activeMode.right, customSidebars.right, parts, activeTemplateId],
  );
  const activeLeftSidebarZones = useMemo<Record<string, ContentArray>>(
    () =>
      activeMode.left
        ? customSidebarZones.left[activeTemplateId] ?? {}
        : partZones["left-sidebar"] ?? {},
    [activeMode.left, customSidebarZones.left, partZones, activeTemplateId],
  );
  const activeRightSidebarZones = useMemo<Record<string, ContentArray>>(
    () =>
      activeMode.right
        ? customSidebarZones.right[activeTemplateId] ?? {}
        : partZones["right-sidebar"] ?? {},
    [activeMode.right, customSidebarZones.right, partZones, activeTemplateId],
  );

  const activeCustom = customs.find((c) => c.slug === activeTemplateId);
  const activeTemplateSurface: Surface = activeCustom
    ? (surfaceForTemplate(activeTemplateId, activeCustom.parentTemplate) ?? "template-single-page")
    : (TEMPLATES.find((t) => t.id === activeTemplateId)?.surface ?? "template-homepage");
  const activeTemplate: { id: string; label: string; surface: Surface } =
    TEMPLATES.find((t) => t.id === activeTemplateId) ?? {
      id: activeCustom?.slug ?? "homepage",
      label: activeCustom?.displayName ?? "Homepage",
      surface: activeTemplateSurface,
    };

  // Gallery detail cache for the inspector's GalleryPickerField. The
  // page / post editors do the same thing — collect every Gallery
  // block's id from the saved content, fetch its detail once on
  // mount, and surface the cache via GalleryRegisterContext so the
  // picker shows the gallery name + cover thumbnail when reopening
  // a saved layout. Without this, reopening a Gallery widget shows
  // "Gallery #N · Loading…" forever because the field has nothing
  // to read from. The collector walks every part + template + custom
  // sidebar so any zone that holds a Gallery contributes ids.
  const [galleryCache, setGalleryCache] = useState<Record<number, GalleryDetail>>({});
  const initialGalleryIds = useMemo<number[]>(
    () => collectAllGalleryIds(savedRows),
    [savedRows],
  );
  useEffect(() => {
    if (initialGalleryIds.length === 0) return;
    let cancelled = false;
    void (async () => {
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
  const galleryApi = useMemo<GalleryRegisterApi>(
    () => ({
      register: (detail) =>
        setGalleryCache((prev) => ({ ...prev, [detail.id]: detail })),
      getGallery: (id) => galleryCache[id],
    }),
    [galleryCache],
  );

  // Compose the Puck data the editor sees. Uses the "root:<zone>" key
  // convention Puck expects for DropZones inside the root render. The
  // top-level `root:<part>` zones come from `parts` (with sidebar
  // sources branching on `customMode`); the nested zones (anything
  // keyed `<blockId>:<zoneName>`) come from `partZones` /
  // `customSidebarZones` / `templateZones` and are merged in so blocks
  // like StickyContainer re-render with their dropped children intact.
  const puckData = useMemo<Data>(
    () => {
      const merged: Record<string, ContentArray> = {
        "root:header":         parts.header          ?? [],
        "root:left-sidebar":   activeLeftSidebar,
        "root:right-sidebar":  activeRightSidebar,
        "root:footer":         parts.footer          ?? [],
        "root:main":           templateMains[activeTemplateId] ?? [],
      };
      // Merge nested zones from non-sidebar parts unconditionally;
      // sidebars are special-cased below because their source toggles
      // between shared and per-template based on `customMode`.
      for (const partName of Object.keys(partZones)) {
        if (partName === "left-sidebar" || partName === "right-sidebar") continue;
        const owned = partZones[partName] ?? {};
        for (const [k, v] of Object.entries(owned)) merged[k] = v;
      }
      for (const [k, v] of Object.entries(activeLeftSidebarZones)) merged[k] = v;
      for (const [k, v] of Object.entries(activeRightSidebarZones)) merged[k] = v;
      const mainOwned = templateZones[activeTemplateId] ?? {};
      for (const [k, v] of Object.entries(mainOwned)) merged[k] = v;
      return {
        root: { props: {} },
        content: [],
        zones: merged,
      };
    },
    [
      parts,
      partZones,
      templateMains,
      templateZones,
      activeTemplateId,
      activeLeftSidebar,
      activeRightSidebar,
      activeLeftSidebarZones,
      activeRightSidebarZones,
    ],
  );

  // Build a Puck config that exposes every block tagged for any of the
  // five surfaces in the schematic, plus a custom root render that lays
  // them out. Each DropZone limits its library via `allow`. Visibility
  // is folded into the config so the rendered Schematic hides off
  // sidebars and the library narrows accordingly.
  // Singleton blocks (e.g. AuthorAvatar, AuthorName) are pulled out of
  // every zone's `allow` list once they appear anywhere in the
  // schematic. Building this set on every render keeps the rail
  // reactive — drop one in, the rest of the zones immediately stop
  // accepting another instance.
  const presentBlockNames = useMemo<Set<string>>(() => {
    const names = new Set<string>();
    const collect = (rows: ContentArray | undefined) => {
      for (const row of rows ?? []) {
        if (typeof row?.type === "string") names.add(row.type);
      }
    };
    collect(parts.header);
    // Use the *active* sidebar content for singleton accounting — if
    // the template is in custom mode, its custom widgets are what's
    // actually rendered, not the shared default. Without this, dropping
    // a singleton into a custom sidebar wouldn't disable other zones'
    // ability to accept another instance.
    collect(activeLeftSidebar);
    collect(activeRightSidebar);
    collect(parts.footer);
    collect(templateMains[activeTemplateId]);
    return names;
  }, [parts, templateMains, activeTemplateId, activeLeftSidebar, activeRightSidebar]);

  const config = useMemo<Config>(
    () => buildSchematicConfig(activeTemplate.surface, activeVisibility, presentBlockNames),
    [activeTemplate.surface, activeVisibility, presentBlockNames],
  );

  function handleChange(next: Data) {
    if (next === puckData) return;
    // Decompose Puck's data.zones back into our state shape. We don't
    // mutate keys we didn't see — this is robust if Puck ever omits an
    // empty zone from the dictionary.
    const zones = next.zones ?? {};

    // Sidebar incoming arrays. Read once, route to the right bucket
    // (shared `parts` vs per-template `customSidebars`) based on the
    // active template's custom-mode flag.
    const incomingLeftSidebar =
      (zones[`root:left-sidebar`] as ContentArray | undefined) ?? [];
    const incomingRightSidebar =
      (zones[`root:right-sidebar`] as ContentArray | undefined) ?? [];

    const nextParts = { ...parts };
    // Names of parts whose content array changed this tick. We need
    // the granular set (not a single boolean) so the save action only
    // writes the rows that actually moved.
    const changedParts = new Set<string>();
    for (const z of FIXED_ZONES) {
      // Sidebars get special routing — handled below.
      if (z.zone === "left-sidebar" || z.zone === "right-sidebar") continue;
      const incoming = (zones[`root:${z.zone}`] as ContentArray | undefined) ?? [];
      if (incoming !== nextParts[z.zone]) {
        nextParts[z.zone] = incoming;
        changedParts.add(z.zone);
      }
    }

    // Apply sidebar content to either the shared bucket or the
    // per-template override depending on custom mode for the active
    // template. The "other" bucket is intentionally left untouched so
    // edits made on one side of the toggle never leak into the other.
    let leftSidebarChanged = false;
    let rightSidebarChanged = false;
    if (activeMode.left) {
      if (incomingLeftSidebar !== (customSidebars.left[activeTemplateId] ?? [])) {
        leftSidebarChanged = true;
      }
    } else {
      if (incomingLeftSidebar !== nextParts["left-sidebar"]) {
        nextParts["left-sidebar"] = incomingLeftSidebar;
        changedParts.add("left-sidebar");
        leftSidebarChanged = true;
      }
    }
    if (activeMode.right) {
      if (incomingRightSidebar !== (customSidebars.right[activeTemplateId] ?? [])) {
        rightSidebarChanged = true;
      }
    } else {
      if (incomingRightSidebar !== nextParts["right-sidebar"]) {
        nextParts["right-sidebar"] = incomingRightSidebar;
        changedParts.add("right-sidebar");
        rightSidebarChanged = true;
      }
    }
    const partsChanged = changedParts.size > 0;

    const incomingMain = (zones[`root:${MAIN_ZONE}`] as ContentArray | undefined) ?? [];
    const mainChanged = incomingMain !== templateMains[activeTemplateId];

    // Partition every nested-block zone (`<blockId>:<zoneName>`, where
    // <blockId> is NOT "root") into the part / main that owns the
    // ancestor block. Walks each part's content tree, picks up every
    // zone keyed by a descendant id, and recurses into those zones'
    // content too — supports arbitrary nesting depth (StickyContainer
    // inside StickyContainer, etc.).
    const nextPartZones: Record<string, Record<string, ContentArray>> = {};
    for (const z of FIXED_ZONES) {
      // For sidebars in custom mode, leave the shared `partZones`
      // bucket untouched (it represents the shared default). The
      // per-template zone map is computed below.
      if (z.zone === "left-sidebar" && activeMode.left) {
        nextPartZones[z.zone] = partZones[z.zone] ?? {};
        continue;
      }
      if (z.zone === "right-sidebar" && activeMode.right) {
        nextPartZones[z.zone] = partZones[z.zone] ?? {};
        continue;
      }
      const ownerContent = nextParts[z.zone] ?? [];
      nextPartZones[z.zone] = collectOwnedZones(ownerContent, zones);
    }
    const nextLeftCustomZones = activeMode.left
      ? collectOwnedZones(incomingLeftSidebar, zones)
      : null;
    const nextRightCustomZones = activeMode.right
      ? collectOwnedZones(incomingRightSidebar, zones)
      : null;
    const nextMainZones = collectOwnedZones(incomingMain, zones);

    if (partsChanged) setParts(nextParts);
    if (mainChanged) {
      setTemplateMains((prev) => ({ ...prev, [activeTemplateId]: incomingMain }));
    }
    if (leftSidebarChanged && activeMode.left) {
      setCustomSidebars((prev) => ({
        ...prev,
        left: { ...prev.left, [activeTemplateId]: incomingLeftSidebar },
      }));
      setCustomDirty((prev) => {
        if (prev.left.has(activeTemplateId)) return prev;
        const nextSet = new Set(prev.left);
        nextSet.add(activeTemplateId);
        return { ...prev, left: nextSet };
      });
    }
    if (rightSidebarChanged && activeMode.right) {
      setCustomSidebars((prev) => ({
        ...prev,
        right: { ...prev.right, [activeTemplateId]: incomingRightSidebar },
      }));
      setCustomDirty((prev) => {
        if (prev.right.has(activeTemplateId)) return prev;
        const nextSet = new Set(prev.right);
        nextSet.add(activeTemplateId);
        return { ...prev, right: nextSet };
      });
    }
    // Always sync the nested-zones state — content can be unchanged
    // while a nested zone gets edits (typing into a Search Box that
    // sits inside a StickyContainer doesn't change the part's content
    // array, only the inner zone). Compare via JSON equality so we
    // don't churn React refs on no-op changes.
    setPartZones((prev) => (sameZoneMaps(prev, nextPartZones) ? prev : nextPartZones));
    if (nextLeftCustomZones) {
      const existing = customSidebarZones.left[activeTemplateId] ?? {};
      if (!sameZones(existing, nextLeftCustomZones)) {
        setCustomSidebarZones((prev) => ({
          ...prev,
          left: { ...prev.left, [activeTemplateId]: nextLeftCustomZones },
        }));
        // Mark customDirty so the save action persists this template's
        // override even when only a NESTED zone (e.g. a widget inside
        // a StickyContainer in the sidebar) was edited — the top-level
        // sidebar content array can be unchanged in that case.
        setCustomDirty((prev) => {
          if (prev.left.has(activeTemplateId)) return prev;
          const nextSet = new Set(prev.left);
          nextSet.add(activeTemplateId);
          return { ...prev, left: nextSet };
        });
      }
    }
    if (nextRightCustomZones) {
      const existing = customSidebarZones.right[activeTemplateId] ?? {};
      if (!sameZones(existing, nextRightCustomZones)) {
        setCustomSidebarZones((prev) => ({
          ...prev,
          right: { ...prev.right, [activeTemplateId]: nextRightCustomZones },
        }));
        setCustomDirty((prev) => {
          if (prev.right.has(activeTemplateId)) return prev;
          const nextSet = new Set(prev.right);
          nextSet.add(activeTemplateId);
          return { ...prev, right: nextSet };
        });
      }
    }
    setTemplateZones((prev) => {
      const existing = prev[activeTemplateId] ?? {};
      if (sameZones(existing, nextMainZones)) return prev;
      return { ...prev, [activeTemplateId]: nextMainZones };
    });

    // Granular dirty marks — one mark per saveThemeData call the save
    // button will end up firing. Without this, every save unconditionally
    // wrote all 5 fixed rows + the active template main (5+ DB
    // round-trips, 5+ audit_log inserts, redundant revalidations).
    for (const name of changedParts) markPartDirty(name);
    // Per-part zone changes — walk nextPartZones bucket-by-bucket so a
    // nested edit inside (say) the header gets attributed to "header"
    // only, not blanket-marking every part.
    for (const z of FIXED_ZONES) {
      // Sidebars in custom mode keep their nested zones in the
      // per-template buckets (handled by customDirty + custom-zones
      // setters above), not in shared `partZones`.
      if (z.zone === "left-sidebar" && activeMode.left) continue;
      if (z.zone === "right-sidebar" && activeMode.right) continue;
      const before = partZones[z.zone] ?? {};
      const after = nextPartZones[z.zone] ?? {};
      if (!sameZones(before, after)) markPartDirty(z.zone);
    }
    if (mainChanged || !sameZones(templateZones[activeTemplateId] ?? {}, nextMainZones)) {
      markTemplateDirty(activeTemplateId);
    }
  }

  function switchTemplate(nextId: string) {
    if (nextId === activeTemplateId) return;
    setActiveTemplateId(nextId);
    // Don't clear dirty: parts edits roll forward into the new template.
  }

  function toggleSidebar(side: "left" | "right") {
    const next = !visibility[activeTemplateId][side];
    // Optimistic update so the schematic flips immediately.
    setVisibility((prev) => ({
      ...prev,
      [activeTemplateId]: { ...prev[activeTemplateId], [side]: next },
    }));
    startTransition(async () => {
      const r = await saveThemeSettingAction(
        theme.slug,
        `theme.${theme.slug}.template.${activeTemplateId}.show_${side}_sidebar`,
        next,
      );
      if (!r.ok) {
        // Roll back on failure.
        setVisibility((prev) => ({
          ...prev,
          [activeTemplateId]: { ...prev[activeTemplateId], [side]: !next },
        }));
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Flip the per-template "use a custom sidebar for this template"
   * flag. The setting itself saves immediately; the underlying widget
   * data is editable instantly but only persists on the next Save.
   *
   * On flip ON: if the per-template override bucket is empty AND no
   * row was loaded, seed it with a JSON-deep-copy of the currently
   * visible shared sidebar so the user starts from "what's already
   * here" rather than a blank slate. Mark the bucket dirty so save
   * writes the seeded copy.
   *
   * On flip OFF: leave the override bucket alone — toggling back ON
   * later restores whatever the user had. Reset is the only way to
   * clear an override permanently.
   */
  function toggleCustomSidebar(side: "left" | "right") {
    const tid = activeTemplateId;
    const wasOn = customMode[tid][side];
    const nextOn = !wasOn;

    setCustomMode((prev) => ({
      ...prev,
      [tid]: { ...prev[tid], [side]: nextOn },
    }));

    if (nextOn) {
      // Seed the override from the current shared sidebar when the
      // user is turning customization on for the first time. Deep
      // clone so subsequent edits to the override don't mutate the
      // shared array.
      const sharedKey = side === "left" ? "left-sidebar" : "right-sidebar";
      const existingContent =
        side === "left"
          ? customSidebars.left[tid] ?? []
          : customSidebars.right[tid] ?? [];
      const existingZones =
        side === "left"
          ? customSidebarZones.left[tid] ?? {}
          : customSidebarZones.right[tid] ?? {};
      const hasOverride =
        existingContent.length > 0 || Object.keys(existingZones).length > 0;
      if (!hasOverride) {
        const seededContent = deepCloneContent(parts[sharedKey] ?? []);
        const seededZones = deepCloneZones(partZones[sharedKey] ?? {});
        if (side === "left") {
          setCustomSidebars((prev) => ({
            ...prev,
            left: { ...prev.left, [tid]: seededContent },
          }));
          setCustomSidebarZones((prev) => ({
            ...prev,
            left: { ...prev.left, [tid]: seededZones },
          }));
          setCustomDirty((prev) => {
            const nextSet = new Set(prev.left);
            nextSet.add(tid);
            return { ...prev, left: nextSet };
          });
        } else {
          setCustomSidebars((prev) => ({
            ...prev,
            right: { ...prev.right, [tid]: seededContent },
          }));
          setCustomSidebarZones((prev) => ({
            ...prev,
            right: { ...prev.right, [tid]: seededZones },
          }));
          setCustomDirty((prev) => {
            const nextSet = new Set(prev.right);
            nextSet.add(tid);
            return { ...prev, right: nextSet };
          });
        }
        // Marking customDirty above is enough — the derived `dirty`
        // flag picks it up. No separate "global dirty" mark needed.
      }
    }

    startTransition(async () => {
      const r = await saveThemeSettingAction(
        theme.slug,
        `theme.${theme.slug}.template.${tid}.custom_${side}_sidebar`,
        nextOn,
      );
      if (!r.ok) {
        // Roll back the optimistic flip on failure.
        setCustomMode((prev) => ({
          ...prev,
          [tid]: { ...prev[tid], [side]: wasOn },
        }));
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  async function save() {
    if (!dirty) {
      toast("No changes to save");
      return;
    }
    startTransition(async () => {
      // Only fire saveThemeDataAction for the rows that actually moved
      // this session — see the dirty-set setup above. Each entry maps
      // 1:1 to a previously-unconditional save call.
      const tasks: Promise<SaveResult>[] = [];
      // Fixed parts (header / sidebars / footer). Skip a sidebar whose
      // active template is in custom mode — that template's edits land
      // in the per-template override row below, not the shared bucket.
      for (const partName of dirtyParts) {
        if (partName === "left-sidebar" && customMode[activeTemplateId]?.left) continue;
        if (partName === "right-sidebar" && customMode[activeTemplateId]?.right) continue;
        tasks.push(
          saveThemeDataAction(
            theme.slug,
            "part",
            partName,
            wrapContent(parts[partName], partZones[partName]),
          ),
        );
      }
      // Touched templates' main + zones.
      for (const tid of dirtyTemplates) {
        tasks.push(
          saveThemeDataAction(
            theme.slug,
            "template",
            tid,
            wrapContent(templateMains[tid], templateZones[tid]),
          ),
        );
      }
      // Per-template sidebar overrides — only written for templates
      // the user explicitly touched this session (customDirty), and
      // only when that side is currently in custom mode.
      for (const side of ["left", "right"] as const) {
        const dirtySet = side === "left" ? customDirty.left : customDirty.right;
        for (const tid of dirtySet) {
          if (!customMode[tid]?.[side]) continue;
          const content =
            side === "left"
              ? customSidebars.left[tid] ?? []
              : customSidebars.right[tid] ?? [];
          const zones =
            side === "left"
              ? customSidebarZones.left[tid] ?? {}
              : customSidebarZones.right[tid] ?? {};
          tasks.push(
            saveThemeDataAction(
              theme.slug,
              "part",
              `${side}-sidebar:${tid}`,
              wrapContent(content, zones),
            ),
          );
        }
      }
      if (tasks.length === 0) {
        toast("No changes to save");
        return;
      }
      const results = await Promise.all(tasks);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        toast.error(failed.error);
        return;
      }
      // One revalidation call after the whole batch — saves us from
      // firing 2 × N redundant invalidations from inside each row's
      // server action. Fire-and-forget; the cache flip is a side
      // effect we don't need to await for UI feedback.
      void revalidateThemePathsAction(theme.slug);
      toast.success("Saved");
      setDirtyParts(new Set());
      setDirtyTemplates(new Set());
      // Everything in the dirty sets just got persisted — clear all
      // touched-this-session bookkeeping (not just the active tab's),
      // because the save now fires for every template whose override
      // bucket was touched, not only the active one.
      setCustomDirty({ left: new Set(), right: new Set() });
      // NOTE: dropped `router.refresh()` here. It used to re-run the
      // entire builder page on the server (savedRows + galleries +
      // pillars + setting rows etc., 10+ round-trips on Turso) just to
      // synchronise back local state that already mirrors what was
      // saved. The revalidation above keeps the next page-load fresh.
    });
  }

  function reset() {
    void (async () => {
      const ok = await confirm({
        title: `Reset the ${activeTemplate.label} layout?`,
        description:
          "Clears the saved rows for this template's Main zone AND the four shared parts (Header, Footer, Left + Right Sidebar). Any per-template sidebar overrides for this template are deleted too. The next render falls back to whatever the theme's seed migration ships.",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const tasks = [
          resetThemeDataAction(theme.slug, "part", "header"),
          resetThemeDataAction(theme.slug, "part", "left-sidebar"),
          resetThemeDataAction(theme.slug, "part", "right-sidebar"),
          resetThemeDataAction(theme.slug, "part", "footer"),
          resetThemeDataAction(theme.slug, "template", activeTemplateId),
          // Per-template sidebar overrides for this template only.
          // Other templates' overrides survive the reset.
          resetThemeDataAction(
            theme.slug,
            "part",
            `left-sidebar:${activeTemplateId}`,
          ),
          resetThemeDataAction(
            theme.slug,
            "part",
            `right-sidebar:${activeTemplateId}`,
          ),
        ];
        const results = await Promise.all(tasks);
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) {
          toast.error(failed.error);
          return;
        }
        toast.success("Reset to defaults");
        router.refresh();
      });
    })();
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/themes"
            className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-green"
          >
            <ArrowLeft className="size-3" />
            Back to Themes
          </Link>
          <h1 className="font-display text-3xl tracking-tight text-brand-navy">
            {theme.name} <span className="text-base font-normal text-slate-500">— Builder</span>
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            v{theme.version}
            {theme.author ? <> · {theme.author}</> : null}
            {dirty ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Unsaved changes
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-green px-4 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
          >
            <Save className="size-4" />
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Template tabs — switching changes only what the Main zone shows. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {TEMPLATES.map((t) => {
            const isActive = t.id === activeTemplateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTemplate(t.id)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition ${
                  isActive ? "bg-brand-green text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {customs.length > 0 ? (
            <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-2">
              <span className="whitespace-nowrap text-xs text-slate-400">Custom:</span>
              <Select
                value={customs.some((c) => c.slug === activeTemplateId) ? activeTemplateId : ""}
                onValueChange={(v) => { if (v) switchTemplate(String(v)); }}
              >
                <SelectTrigger
                  aria-label="Custom templates"
                  className="h-8 min-w-[15rem] px-2.5 text-xs shadow-none"
                >
                  <SelectValue placeholder="Select custom…">
                    {(value) => {
                      if (!value) return null;
                      const slug = String(value);
                      return customs.find((c) => c.slug === slug)?.displayName ?? slug;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(CLONEABLE_TEMPLATE_IDS as readonly string[]).map((parentId) => {
                    const group = customs.filter((c) => c.parentTemplate === parentId);
                    if (group.length === 0) return null;
                    const parentLabel =
                      BUILT_IN_TEMPLATE_LABELS[parentId as BuiltInTemplateId] ?? parentId;
                    return (
                      <SelectGroup key={parentId}>
                        <SelectLabel>{parentLabel}</SelectLabel>
                        {group.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.displayName}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        {/* Per-template sidebar toggles. Saves immediately to the
            theme.<slug>.template.<id>.show_*_sidebar setting. */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <SidebarToggleButton
            side="left"
            on={activeVisibility.left}
            disabled={pending}
            onToggle={() => toggleSidebar("left")}
          />
          <SidebarToggleButton
            side="right"
            on={activeVisibility.right}
            disabled={pending}
            onToggle={() => toggleSidebar("right")}
          />
        </div>
        {/* Per-template sidebar customisation toggles. When on, the
            template uses its own widgets in that sidebar; when off,
            the shared default applies. Saves to
            theme.<slug>.template.<id>.custom_*_sidebar. */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
          <CustomSidebarToggleButton
            side="left"
            on={activeMode.left}
            disabled={pending || !activeVisibility.left}
            onToggle={() => toggleCustomSidebar("left")}
          />
          <CustomSidebarToggleButton
            side="right"
            on={activeMode.right}
            disabled={pending || !activeVisibility.right}
            onToggle={() => toggleCustomSidebar("right")}
          />
        </div>
      </div>

      {/* Builder canvas — single Puck instance, schematic root, 5 DropZones.
          Re-mounted on template switch so internal Puck state resets cleanly.
          GalleryRegisterContext lets the inspector's GalleryPickerField
          look up a saved gallery's detail (name + cover) without having
          to refetch every render. The cache is seeded from saved theme
          data on mount and updated whenever the user picks a new
          gallery. */}
      <GalleryRegisterContext.Provider value={galleryApi}>
      <Puck
        key={`${activeTemplateId}|${activeVisibility.left ? "L" : "_"}${activeVisibility.right ? "R" : "_"}|${activeMode.left ? "cl" : "sl"}|${activeMode.right ? "cr" : "sr"}`}
        config={config}
        data={puckData}
        onChange={handleChange}
        // Marks this Puck instance as the theme builder — blocks shared
        // with the page/post editor (RichText, Banner, Spacer, Separator)
        // read this flag and switch their `puck.isEditing` branch to a
        // uniform BuilderCard placeholder. Without it, those blocks
        // render their actual styled content (the page/post editor's
        // WYSIWYG behavior, which is what those editors had before
        // BuilderCard was unified across surfaces).
        //
        // `galleries` powers the Gallery block's WYSIWYG canvas
        // preview (real thumbnails / carousel) when in Builder mode
        // for non-themeBuilder branches. The GalleryPickerField in
        // the inspector reads from GalleryRegisterContext above.
        metadata={{ themeBuilder: true, themeLogoUrl, galleries: galleryCache }}
        iframe={{ enabled: false }}
        // Wrap each widget rail entry with its icon. `children` is
        // Puck's default rendered drawer card (a draggable handle); we
        // prepend the icon and keep the card otherwise intact so drag
        // affordances stay live.
        //
        // Icon resolution order:
        //   1. RegisteredBlock.icon (SVG path data) — plugins / themes
        //      ship this in `theme-blocks.tsx`, typically pulled from
        //      their `plugin.json` admin.icon so the rail matches the
        //      sidebar nav icon.
        //   2. WIDGET_ICONS[name] — hardcoded Lucide map for core blocks.
        //   3. Placeholder span (keeps label alignment).
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
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden h-[calc(100vh-15rem)] flex">
          {/* Widgets rail */}
          <div className="w-55 shrink-0 border-r border-slate-200 bg-slate-50/40 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white sticky top-0 z-20">
              Widgets
            </div>
            <div className="p-2">
              <Puck.Components />
            </div>
          </div>

          {/* Schematic preview — fills the available height so the
              empty zones span the canvas instead of huddling at the top. */}
          <div className="flex-1 min-w-0 min-h-0 overflow-auto bg-slate-100 p-6">
            <div className="mx-auto flex h-full max-w-5xl flex-col">
              <Puck.Preview />
            </div>
          </div>

          {/* Block settings rail */}
          <div className="w-[320px] shrink-0 border-l border-slate-200 bg-slate-50/40 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white sticky top-0 z-20">
              Block settings
            </div>
            <div className="p-2 min-w-0">
              <Puck.Fields />
            </div>
          </div>
        </div>
      </Puck>
      </GalleryRegisterContext.Provider>
    </div>
  );
}

// ─── Config + data helpers ─────────────────────────────────────────────────

type ContentArray = Data["content"];

function blocksForZone(surface: Surface): RegisteredBlock[] {
  return getBlocksForSurface(surface);
}

function buildSchematicConfig(
  mainSurface: Surface,
  visibility: { left: boolean; right: boolean },
  presentBlockNames: ReadonlySet<string>,
): Config {
  // Combine every block visible in the surfaces this template currently
  // exposes. Hidden sidebars drop their surface from the library so the
  // user doesn't see widgets that have nowhere to land.
  const surfaces: Surface[] = ["header", "footer", mainSurface];
  if (visibility.left || visibility.right) surfaces.push("sidebar");
  const seen = new Map<string, RegisteredBlock>();
  for (const surface of surfaces) {
    for (const b of getBlocksForSurface(surface)) {
      seen.set(b.name, b);
    }
  }

  // Categories preserve registration insertion order (Map). Tag with a
  // [Region] suffix on the components allowed only in one region, so the
  // user knows which zones a widget fits before dragging.
  const components: Record<string, RegisteredBlock["config"]> = {};
  const categories = new Map<string, { title: string; components: string[] }>();
  for (const b of seen.values()) {
    // Always populate components so Puck can resolve a block by name when
    // rendering saved data — even essentials and exhausted singletons
    // need to be in here.
    components[b.name] = b.config;
    // Hide from the widgets rail when:
    //   - essential (lives in the seed at a fixed location), or
    //   - singleton already present somewhere in the schematic — there's
    //     no zone left that would accept it, so listing it would just
    //     mislead the user.
    if (b.essential) continue;
    if (b.singleton && presentBlockNames.has(b.name)) continue;
    const key = b.category.toLowerCase();
    let cat = categories.get(key);
    if (!cat) {
      cat = { title: b.category, components: [] };
      categories.set(key, cat);
    }
    cat.components.push(b.name);
  }

  // Drop a block from the allow list only for singletons that already
  // exist somewhere in the page — prevents e.g. two Author Avatars
  // across main + sidebar.
  //
  // Essentials are KEPT in allow lists. They're already hidden from the
  // widgets rail (loop above), and their per-instance permissions
  // (`delete: false`, `duplicate: false`) prevent removal/copying — so
  // the only thing allow-list filtering blocks is *moving* the existing
  // essential between zones (e.g. dragging PageContent into a Layout
  // column and then back to Main). Filtering them out trapped users
  // who reorganized their schematic; keeping them in is safe because
  // no NEW essential can be introduced from the rail.
  const allowFor = (zoneSurface: Surface): string[] =>
    blocksForZone(zoneSurface)
      .filter((b) => !(b.singleton && presentBlockNames.has(b.name)))
      .map((b) => b.name);

  const allow = {
    header:        allowFor("header"),
    leftSidebar:   allowFor("sidebar"),
    main:          allowFor(mainSurface),
    rightSidebar:  allowFor("sidebar"),
    footer:        allowFor("footer"),
  };

  // Puck auto-buckets any component that isn't listed in any category
  // into a category called "other". Essentials stay in `components` so
  // saved data resolves, but they're not in any visible category — they
  // would otherwise surface in the auto-"other" group. Declaring it
  // explicitly with `visible: false` suppresses the bucket entirely.
  const categoriesObj = {
    ...Object.fromEntries(categories),
    other: { title: "Other", components: [], visible: false },
  };

  return {
    // Decorate every block with the universal hide-on-mobile /
    // hide-on-desktop toggles. The post/page editor path picks these
    // up via `buildPuckConfigForSurface`; the theme builder builds its
    // schematic config inline and would otherwise miss the toggles.
    components: decorateComponents(components) as Config["components"],
    categories: categoriesObj as Config["categories"],
    root: {
      fields: {},
      render: () => <Schematic allow={allow} visibility={visibility} />,
    },
  };
}

function Schematic({
  allow,
  visibility,
}: {
  allow: { header: string[]; leftSidebar: string[]; main: string[]; rightSidebar: string[]; footer: string[] };
  visibility: { left: boolean; right: boolean };
}) {
  const sidebarsOn = (visibility.left ? 1 : 0) + (visibility.right ? 1 : 0);
  const mainSpan: 2 | 3 | 4 = sidebarsOn === 2 ? 2 : sidebarsOn === 1 ? 3 : 4;
  const mainSpanClass = MAIN_SPAN_CLASS[mainSpan];

  // Puck.Preview already has height:100%, but the height chain breaks
  // somewhere through Puck's internal wrappers — relying on `min-h-full`
  // here ends up resolving against an auto-height parent. Pin a
  // viewport-relative minimum on the Schematic directly so the empty
  // zones fill the canvas regardless of what wraps the root render.
  return (
    <div
      className="flex flex-1 flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-2 shadow-sm"
      style={{ minHeight: "calc(100vh - 18rem)" }}
    >
      <Region label="Header" className="shrink-0">
        <DropZone zone="header" allow={allow.header} />
      </Region>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-2">
        {visibility.left ? (
          <Region label="Left Sidebar" className="col-span-1 flex flex-col">
            <DropZone zone="left-sidebar" allow={allow.leftSidebar} minEmptyHeight={240} />
          </Region>
        ) : null}
        <Region label="Main" className={`${mainSpanClass} flex flex-col`}>
          <DropZone zone="main" allow={allow.main} minEmptyHeight={240} />
        </Region>
        {visibility.right ? (
          <Region label="Right Sidebar" className="col-span-1 flex flex-col">
            <DropZone zone="right-sidebar" allow={allow.rightSidebar} minEmptyHeight={240} />
          </Region>
        ) : null}
      </div>
      <Region label="Footer" className="shrink-0">
        <DropZone zone="footer" allow={allow.footer} />
      </Region>
    </div>
  );
}

function SidebarToggleButton({
  side,
  on,
  disabled,
  onToggle,
}: {
  side: "left" | "right";
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const Icon = side === "left" ? PanelLeft : PanelRight;
  const label = side === "left" ? "Left sidebar" : "Right sidebar";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={`${label}: ${on ? "on" : "off"} (click to toggle)`}
      aria-pressed={on}
      className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition disabled:opacity-50 ${
        on
          ? "bg-brand-green/10 text-brand-green hover:bg-brand-green/15"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      <Icon className="size-4" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}

/** Per-template "use a custom sidebar instead of the shared default"
 *  toggle. When off (the typical case) the template inherits the
 *  shared sidebar; when on, edits in the schematic save to a
 *  per-template part keyed `(left|right)-sidebar:<templateId>`. */
function CustomSidebarToggleButton({
  side,
  on,
  disabled,
  onToggle,
}: {
  side: "left" | "right";
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const label = side === "left" ? "Custom L" : "Custom R";
  const longLabel = `Custom ${side === "left" ? "left" : "right"} sidebar`;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={`${longLabel}: ${on ? "on (this template has its own widgets)" : "off (uses shared default)"}`}
      aria-pressed={on}
      className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition disabled:opacity-50 ${
        on
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      <Layers className="size-4" />
      <span className="sr-only md:not-sr-only">{label}</span>
    </button>
  );
}

function Region({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Region itself is a flex column so the inner DropZone wrapper can
  // flex-1 to fill the Region's height — required for both the body-row
  // sidebars/main (which inherit height from the row) and for Header /
  // Footer (which get an explicit min-h via className).
  return (
    <div className={`relative flex flex-col rounded-lg border border-slate-200 bg-slate-50/40 p-2 ${className ?? ""}`}>
      <span className="absolute -top-2 left-2 rounded bg-white px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex min-h-0 flex-1 flex-col pt-2">{children}</div>
    </div>
  );
}

// ─── Save/load helpers ─────────────────────────────────────────────────────

/** Wrap a flat content array (and its nested DropZone data, if any)
 *  in a `{ content, zones }` envelope so `setThemeData` serialises the
 *  same shape every render reads back. Zones are keyed
 *  `<blockId>:<zoneName>` and only contain entries owned by descendant
 *  blocks of this part — collected upstream by `collectOwnedZones`. */
function wrapContent(
  content: ContentArray | undefined,
  zones: Record<string, ContentArray> | undefined,
): { content: ContentArray; zones: Record<string, ContentArray> } {
  return { content: content ?? [], zones: zones ?? {} };
}

/** Pull `content` out of a stored value if present; older / future values
 *  that are bare arrays also work. */
function unwrapContent(stored: unknown): ContentArray {
  if (!stored) return [];
  if (Array.isArray(stored)) return stored as ContentArray;
  if (typeof stored === "object" && Array.isArray((stored as { content?: unknown }).content)) {
    return (stored as { content: ContentArray }).content;
  }
  return [];
}

/** Pull the nested-zone block out of a stored value. Older blobs that
 *  predate this change have no `zones` key — returning an empty record
 *  keeps reads stable until the user re-saves. */
function unwrapZones(stored: unknown): Record<string, ContentArray> {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const z = (stored as { zones?: unknown }).zones;
  if (!z || typeof z !== "object") return {};
  // Trust Puck's keying convention; defensive guards on values stay
  // cheap and protect against legacy / corrupted rows.
  const out: Record<string, ContentArray> = {};
  for (const [key, val] of Object.entries(z as Record<string, unknown>)) {
    if (Array.isArray(val)) out[key] = val as ContentArray;
  }
  return out;
}

function loadPartsContent(savedRows: ThemeDataValue[]): Record<string, ContentArray> {
  const out: Record<string, ContentArray> = {
    header: [],
    "left-sidebar": [],
    "right-sidebar": [],
    footer: [],
  };
  for (const row of savedRows) {
    if (row.kind !== "part") continue;
    if (row.name in out) {
      out[row.name] = unwrapContent(row.puckData);
    }
  }
  return out;
}

function loadPartsZones(savedRows: ThemeDataValue[]): Record<string, Record<string, ContentArray>> {
  const out: Record<string, Record<string, ContentArray>> = {
    header: {},
    "left-sidebar": {},
    "right-sidebar": {},
    footer: {},
  };
  for (const row of savedRows) {
    if (row.kind !== "part") continue;
    if (row.name in out) {
      out[row.name] = unwrapZones(row.puckData);
    }
  }
  return out;
}

function loadTemplateMainsContent(
  savedRows: ThemeDataValue[],
  customs: { slug: string }[] = [],
): Record<string, ContentArray> {
  const out: Record<string, ContentArray> = {
    homepage: [],
    "single-page": [],
    "single-post": [],
    "single-pillar": [],
    "topic-archive": [],
    "not-found": [],
    "search-results": [],
    author: [],
  };
  for (const c of customs) out[c.slug] = [];
  for (const row of savedRows) {
    if (row.kind !== "template") continue;
    if (row.name in out) {
      out[row.name] = unwrapContent(row.puckData);
    }
  }
  return out;
}

function loadTemplateMainsZones(
  savedRows: ThemeDataValue[],
  customs: { slug: string }[] = [],
): Record<string, Record<string, ContentArray>> {
  const out: Record<string, Record<string, ContentArray>> = {
    homepage: {},
    "single-page": {},
    "single-post": {},
    "single-pillar": {},
    "topic-archive": {},
    "not-found": {},
    "search-results": {},
    author: {},
  };
  for (const c of customs) out[c.slug] = {};
  for (const row of savedRows) {
    if (row.kind !== "template") continue;
    if (row.name in out) {
      out[row.name] = unwrapZones(row.puckData);
    }
  }
  return out;
}

const BUILT_IN_TEMPLATE_IDS: string[] = [
  "homepage",
  "single-page",
  "single-post",
  "single-pillar",
  "topic-archive",
  "not-found",
  "search-results",
  "author",
];

function emptyTemplateMap<V>(
  value: () => V,
  ids: string[] = BUILT_IN_TEMPLATE_IDS,
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const tid of ids) out[tid] = value();
  return out;
}

/** Match part-name keys of the form `(left|right)-sidebar:<templateId>`.
 *  Returns the side and template id when matched. Anything else (the
 *  shared `left-sidebar` / `right-sidebar` parts, header / footer
 *  parts, or rows with unknown template ids) is rejected.
 *
 *  `knownIds` defaults to the built-in templates only — callers that
 *  also want to accept custom-template slugs must pass the augmented
 *  list explicitly. */
function parseCustomSidebarPartName(
  name: string,
  knownIds: string[] = BUILT_IN_TEMPLATE_IDS,
): { side: "left" | "right"; templateId: string } | null {
  const match = /^(left|right)-sidebar:(.+)$/.exec(name);
  if (!match) return null;
  const side = match[1] as "left" | "right";
  const tid = match[2];
  if (!knownIds.includes(tid)) return null;
  return { side, templateId: tid };
}

/** Pull the per-template sidebar content out of saved rows. Each
 *  side is keyed by template id; templates without a saved row use
 *  an empty array. */
function loadCustomSidebarsContent(
  savedRows: ThemeDataValue[],
  customs: { slug: string }[] = [],
): { left: Record<string, ContentArray>; right: Record<string, ContentArray> } {
  const knownIds = [...BUILT_IN_TEMPLATE_IDS, ...customs.map((c) => c.slug)];
  const left = emptyTemplateMap<ContentArray>(() => [], knownIds);
  const right = emptyTemplateMap<ContentArray>(() => [], knownIds);
  for (const row of savedRows) {
    if (row.kind !== "part") continue;
    const parsed = parseCustomSidebarPartName(row.name, knownIds);
    if (!parsed) continue;
    const content = unwrapContent(row.puckData);
    if (parsed.side === "left") left[parsed.templateId] = content;
    else right[parsed.templateId] = content;
  }
  return { left, right };
}

/** Same as above, but for the nested `<blockId>:<zoneName>` map that
 *  StickyContainer / future nested DropZones depend on. */
function loadCustomSidebarsZones(
  savedRows: ThemeDataValue[],
  customs: { slug: string }[] = [],
): {
  left: Record<string, Record<string, ContentArray>>;
  right: Record<string, Record<string, ContentArray>>;
} {
  const knownIds = [...BUILT_IN_TEMPLATE_IDS, ...customs.map((c) => c.slug)];
  const left = emptyTemplateMap<Record<string, ContentArray>>(() => ({}), knownIds);
  const right = emptyTemplateMap<Record<string, ContentArray>>(() => ({}), knownIds);
  for (const row of savedRows) {
    if (row.kind !== "part") continue;
    const parsed = parseCustomSidebarPartName(row.name, knownIds);
    if (!parsed) continue;
    const zones = unwrapZones(row.puckData);
    if (parsed.side === "left") left[parsed.templateId] = zones;
    else right[parsed.templateId] = zones;
  }
  return { left, right };
}

/** Deep-clone a Puck content array via JSON round-trip. Used when
 *  seeding a per-template sidebar override from the shared default —
 *  prevents subsequent edits to the override from mutating the
 *  shared array (Puck mutates content nodes in place sometimes). */
function deepCloneContent(content: ContentArray): ContentArray {
  return JSON.parse(JSON.stringify(content)) as ContentArray;
}

function deepCloneZones(
  zones: Record<string, ContentArray>,
): Record<string, ContentArray> {
  return JSON.parse(JSON.stringify(zones)) as Record<string, ContentArray>;
}

/**
 * Collect every Gallery block's `galleryId` referenced anywhere in the
 * theme's saved data — across all parts, all template main zones, and
 * every nested zone (StickyContainer children etc.). Used on mount to
 * pre-fetch gallery details into the GalleryRegisterContext cache so
 * the inspector's GalleryPickerField can render saved selections with
 * their real name + cover thumbnail (instead of falling back to
 * "Gallery #N · Loading…" forever).
 */
function collectAllGalleryIds(savedRows: ThemeDataValue[]): number[] {
  const ids = new Set<number>();
  function visit(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const block of content as Array<{
      type?: string;
      props?: { galleryId?: number | null };
    }>) {
      if (block?.type === "Gallery") {
        const gid = block.props?.galleryId;
        if (typeof gid === "number" && Number.isFinite(gid)) ids.add(gid);
      }
    }
  }
  for (const row of savedRows) {
    const data = row.puckData;
    if (!data || typeof data !== "object") continue;
    const stored = data as { content?: unknown; zones?: Record<string, unknown> };
    visit(stored.content);
    if (stored.zones && typeof stored.zones === "object") {
      for (const zoneContent of Object.values(stored.zones)) {
        visit(zoneContent);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Walk a part's (or template main's) content tree and collect every
 * zone in `allZones` whose key starts with `<blockId>:` for any block
 * id encountered along the way. Recurses into the collected zones'
 * content arrays so a StickyContainer holding another StickyContainer
 * (and so on) keeps every nested level on save.
 */
function collectOwnedZones(
  content: ContentArray | undefined,
  allZones: Record<string, unknown>,
): Record<string, ContentArray> {
  const owned: Record<string, ContentArray> = {};
  const queue: ContentArray[] = [content ?? []];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const arr = queue.shift()!;
    for (const block of arr) {
      const id = block?.props?.id;
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      const prefix = `${id}:`;
      for (const [key, val] of Object.entries(allZones)) {
        if (!key.startsWith(prefix)) continue;
        if (!Array.isArray(val)) continue;
        owned[key] = val as ContentArray;
        queue.push(val as ContentArray);
      }
    }
  }
  return owned;
}

function sameZones(
  a: Record<string, ContentArray>,
  b: Record<string, ContentArray>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function sameZoneMaps(
  a: Record<string, Record<string, ContentArray>>,
  b: Record<string, Record<string, ContentArray>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!sameZones(a[k], b[k])) return false;
  }
  return true;
}
