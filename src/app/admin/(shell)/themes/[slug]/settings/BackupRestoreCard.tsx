"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ThemeListItem } from "@core-plugins/themes/service";
import {
  exportThemeSettingsAction,
  importThemeSettingsAction,
  previewImportThemeSettingsAction,
  type RestorePreview,
} from "./actions";

interface Props {
  theme: ThemeListItem;
}

const cardCls = "rounded-xl border border-slate-200 bg-white p-5";
const buttonCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-green px-4 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50";
const secondaryButtonCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function BackupRestoreCard({ theme }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ExportCard theme={theme} />
      <ImportCard theme={theme} />
    </div>
  );
}

function ExportCard({ theme }: Props) {
  const [pending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportThemeSettingsAction(theme.slug);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const json = JSON.stringify(result.export, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = result.export.exportedAt.replace(/[:T]/g, "-").replace(/\..+$/, "");
      a.download = `theme-${theme.slug}-settings-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const count = Object.keys(result.export.settings).length;
      toast.success(`Exported ${count} setting${count === 1 ? "" : "s"}`);
    });
  }

  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-900">Export settings</h3>
      <p className="mt-1 text-xs text-slate-500">
        Download every <code>theme.{theme.slug}.*</code> setting as a JSON
        file. The file can be re-imported here or on another NextPress install.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleExport}
          disabled={pending}
          className={buttonCls}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {pending ? "Exporting…" : "Export"}
        </button>
      </div>
    </section>
  );
}

function ImportCard({ theme }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setPreview(null);
    setError(null);
    if (!next) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", next);
      const result = await previewImportThemeSettingsAction(theme.slug, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleImport() {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await importThemeSettingsAction(theme.slug, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { applied, skipped, failed } = result.summary;
      if (failed.length > 0) {
        toast.error(
          `Imported ${applied}, skipped ${skipped}, ${failed.length} failed: ${failed
            .map((f) => f.key)
            .slice(0, 3)
            .join(", ")}${failed.length > 3 ? "…" : ""}`,
        );
      } else {
        toast.success(
          `Imported ${applied} setting${applied === 1 ? "" : "s"}${
            skipped > 0 ? ` (${skipped} skipped)` : ""
          }`,
        );
      }
      reset();
      router.refresh();
    });
  }

  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-900">Import settings</h3>
      <p className="mt-1 text-xs text-slate-500">
        Upload a JSON file previously exported from this page. Existing values
        for matched keys are replaced; keys not in the file remain unchanged.
      </p>

      <div className="mt-4">
        <label
          htmlFor={`backup-file-${theme.slug}`}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload className="size-4" />
          Choose file…
        </label>
        <input
          id={`backup-file-${theme.slug}`}
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="sr-only"
        />
        {file ? (
          <span className="ml-3 text-xs text-slate-500">{file.name}</span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
            <span>
              Source: <strong>{preview.fileThemeSlug}</strong>
            </span>
            <span>Exported: {formatTimestamp(preview.exportedAt)}</span>
          </div>
          {preview.slugMismatch ? (
            <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                The file targets theme <strong>{preview.fileThemeSlug}</strong>{" "}
                but you are importing into <strong>{theme.slug}</strong>. Only
                keys recognized by this theme will be applied.
              </span>
            </div>
          ) : null}
          <ul className="space-y-1 text-slate-700">
            <li>
              <strong>{preview.applicable.length}</strong> setting
              {preview.applicable.length === 1 ? "" : "s"} will be applied
            </li>
            <li className="text-slate-500">
              {preview.unknown.length} unknown key
              {preview.unknown.length === 1 ? "" : "s"} skipped
            </li>
            <li className="text-slate-500">
              {preview.missing.length} registered key
              {preview.missing.length === 1 ? "" : "s"} not in file (unchanged)
            </li>
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleImport}
              disabled={pending || preview.applicable.length === 0}
              className={buttonCls}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {pending ? "Applying…" : "Apply import"}
            </button>
            <button type="button" onClick={reset} className={secondaryButtonCls}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
