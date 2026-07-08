"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Images,
  LayoutGrid,
  Loader2,
  Search,
  Trash2,
  Upload,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AdminSection, type AdminTab } from "@core/components/AdminSection";
import { useConfirm } from "@core/components/ConfirmDialog";
import { LibraryTab } from "./LibraryTab";
import { UploadTab } from "./UploadTab";
import { SettingsTab } from "./SettingsTab";
import { GalleriesTab } from "./GalleriesTab";
import { ThumbSizeControl } from "./ThumbSizeControl";
import { THUMB_SIZE_COOKIE, clampThumbSize } from "./thumb-size";
import { deleteFiles, type MediaPermissions } from "./actions";
import type { ListMediaResult, MediaSettings } from "@core-plugins/media/service";
import type { MigrationStats } from "@core-plugins/media/migrate";
import type { GalleryListItem } from "@core-plugins/galleries";

interface Props {
  permissions: MediaPermissions;
  initialLibrary: ListMediaResult;
  initialSettings: MediaSettings;
  initialGalleries: GalleryListItem[];
  /** Optional initial tab — used by the gallery edit page's back link to
   *  drop the user back on the Galleries tab instead of Library. */
  defaultTab?: string;
  /** Library-grid thumbnail size — index from THUMB_SIZE_LEVELS. Read
   *  from `np_media_thumb_size` cookie on the server. */
  initialThumbSize: number;
  /** True iff every R2_* env var is set — gates the R2 radio in SettingsTab. */
  r2Available: boolean;
  /** Server-rendered snapshot of per-backend counts/sizes for the migration card. */
  initialMigrationStats: MigrationStats;
}

export function MediaPageClient({
  permissions,
  initialLibrary,
  initialSettings,
  initialGalleries,
  defaultTab,
  initialThumbSize,
  r2Available,
  initialMigrationStats,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [bulkDeleting, startBulkDelete] = useTransition();
  const [thumbSize, setThumbSize] = useState<number>(() => clampThumbSize(initialThumbSize));
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const confirm = useConfirm();

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  function changeThumbSize(next: number) {
    const clamped = clampThumbSize(next);
    setThumbSize(clamped);
    if (typeof document !== "undefined") {
      document.cookie = `${THUMB_SIZE_COOKIE}=${clamped}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count < 2) return;
    const ok = await confirm({
      title: `Delete ${count} files?`,
      description: "This removes the selected images from the library. Cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startBulkDelete(async () => {
      const ids = Array.from(selectedIds);
      const result = await deleteFiles(ids);
      if (result.deleted > 0) {
        toast.success(`Deleted ${result.deleted} file${result.deleted === 1 ? "" : "s"}`);
      }
      result.errors.forEach((e) => toast.error(`${e.id}: ${e.error}`));
      setSelectedIds(new Set());
      setRefreshSignal((n) => n + 1);
    });
  }

  const bulkAction =
    selectedIds.size >= 2 ? (
      <button
        type="button"
        onClick={handleBulkDelete}
        disabled={bulkDeleting}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 text-white font-medium text-sm shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {bulkDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete selected ({selectedIds.size})
      </button>
    ) : null;

  const libraryAction = (
    <div className="flex items-center gap-2">
      {bulkAction}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by file name"
          aria-label="Search media by file name"
          className="h-8 w-56 pl-8 pr-2 rounded-md border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
        />
      </div>
      <ThumbSizeControl level={thumbSize} onChange={changeThumbSize} />
    </div>
  );

  const tabs: AdminTab[] = [
    {
      value: "library",
      label: "Library",
      icon: <LayoutGrid className="size-4" />,
      tabsAction: libraryAction,
      content: (
        <LibraryTab
          initial={initialLibrary}
          canDeleteAny={permissions.canDeleteAny}
          currentUserId={permissions.userId}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          refreshSignal={refreshSignal}
          thumbSize={thumbSize}
          search={debouncedSearch}
        />
      ),
    },
  ];

  if (permissions.canUpload) {
    tabs.push({
      value: "upload",
      label: "Upload",
      icon: <Upload className="size-4" />,
      content: <UploadTab settings={initialSettings} />,
    });
  }

  if (permissions.canManageGalleries) {
    tabs.push({
      value: "galleries",
      label: "Galleries",
      icon: <Images className="size-4" />,
      content: <GalleriesTab initial={initialGalleries} />,
    });
  }

  if (permissions.canEditSettings) {
    tabs.push({
      value: "settings",
      label: "Settings",
      icon: <SettingsIcon className="size-4" />,
      content: <SettingsTab initial={initialSettings} r2Available={r2Available} initialMigrationStats={initialMigrationStats} />,
    });
  }

  // Only honor a defaultTab that actually exists in the tabs list — keeps
  // a stale `?tab=settings` URL from selecting a tab the current user
  // can't see.
  const validDefault = tabs.some((t) => t.value === defaultTab) ? defaultTab : undefined;

  return (
    <AdminSection
      title="Media"
      description="Images and other uploads available to your content."
      tabs={tabs}
      defaultTab={validDefault}
    />
  );
}
