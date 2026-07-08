"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { previewRestore, confirmRestore, type RestorePreview } from "./actions";

function formatDate(iso: string): string {
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

export function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setConfirmed(false);
    setPassword("");
    setError(null);

    if (!f) return;

    // Preview the backup
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", f);
      const result = await previewRestore(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleRestore() {
    if (!file || !password) return;
    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("password", password);

      const result = await confirmRestore(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success("Site restored successfully. Please sign in again.");
      // Force full page reload to clear all client state
      window.location.assign("/admin/login?reason=restored");
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setConfirmed(false);
    setPassword("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const tableSummary = preview
    ? Object.entries(preview.manifest.tables)
        .filter(([, count]) => count > 0)
        .length
    : 0;

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <Upload className="size-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-slate-900">Restore from Backup</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload a <code className="font-mono text-xs">.npbackup</code> file to restore your website to a previous state.
            This will replace all current data.
          </p>
        </div>
      </div>

      {/* File upload */}
      {!preview && (
        <div
          className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-slate-300 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand-green"); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand-green"); }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-brand-green");
            const f = e.dataTransfer.files[0];
            if (f) {
              setFile(f);
              const input = fileRef.current;
              if (input) {
                const dt = new DataTransfer();
                dt.items.add(f);
                input.files = dt.files;
                handleFileChange({ target: input } as React.ChangeEvent<HTMLInputElement>);
              }
            }
          }}
        >
          <Upload className="size-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">
            {pending ? "Reading backup..." : "Drop a .npbackup file here or click to browse"}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".npbackup,.zip"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">Backup from:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {formatDate(preview.manifest.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Version:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {preview.manifest.version}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Contains:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {tableSummary} tables, {preview.manifest.totalRows.toLocaleString()} rows
                </span>
              </div>
              <div>
                <span className="text-slate-500">Includes logs:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {preview.manifest.includesLogs ? "Yes" : "No"}
                </span>
              </div>
            </div>

            {preview.versionMessage && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {preview.versionMessage}
              </div>
            )}
            {preview.providerMessage && (
              <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {preview.providerMessage}
              </div>
            )}
          </div>

          {preview.providerOk && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                This will <strong>replace ALL current data</strong> on your site.
                A safety backup of your current data will be created automatically before restoring.
              </span>
            </div>

            <label className="flex items-center gap-2 text-sm text-red-800 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="rounded border-red-300 text-red-600 focus:ring-red-500/30"
              />
              I understand this will replace everything on my site
            </label>

            {confirmed && (
              <div className="pt-2 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Enter your admin password to continue:
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={pending || !password}
                    className="h-10 px-6 rounded-lg bg-red-600 text-white font-medium text-sm shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {pending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Restoring...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        Restore My Site
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={pending}
                    className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {!preview.providerOk && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Pick another file
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
