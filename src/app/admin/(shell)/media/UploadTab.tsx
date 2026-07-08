"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteFile } from "./actions";
import type { MediaSettings, MediaSummary } from "@core-plugins/media/service";

interface UploadResponse {
  ok: boolean;
  uploaded: Array<MediaSummary & { originalFilename: string }>;
  errors: { filename: string; error: string }[];
}

interface Props {
  settings: MediaSettings;
}

interface FileState {
  /** Stable client-side id, persists across upload state changes. */
  key: string;
  filename: string;
  sizeBytes: number;
  /** Object URL from the picked File — works as <img src> immediately. */
  previewUrl: string | null;
  /** Server-issued id, populated once upload succeeds. */
  mediaId?: string;
  status: "uploading" | "done" | "error" | "deleted";
  error?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadTab({ settings }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [recent, setRecent] = useState<FileState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const maxBytes = settings.maxFileSizeMb * 1024 * 1024;

  // Revoke object URLs on unmount so we don't leak blob refs in dev sessions
  // that pile up uploads. The Recent list is short-lived (resets on
  // navigation), so per-row revoke isn't required.
  useEffect(() => {
    return () => {
      recent.forEach((r) => {
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFiles(list: FileList | File[]) {
    const accepted: { file: File; key: string }[] = [];
    const upfront: FileState[] = [];

    for (const f of Array.from(list)) {
      const key = `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!settings.allowedMimeTypes.includes(f.type)) {
        upfront.push({
          key,
          filename: f.name,
          sizeBytes: f.size,
          previewUrl: null,
          status: "error",
          error: `Type ${f.type || "unknown"} not allowed`,
        });
        continue;
      }
      if (f.size > maxBytes) {
        upfront.push({
          key,
          filename: f.name,
          sizeBytes: f.size,
          previewUrl: null,
          status: "error",
          error: `Exceeds ${settings.maxFileSizeMb} MB`,
        });
        continue;
      }
      const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
      accepted.push({ file: f, key });
      upfront.push({
        key,
        filename: f.name,
        sizeBytes: f.size,
        previewUrl,
        status: "uploading",
      });
    }

    setRecent((prev) => [...upfront, ...prev]);
    if (accepted.length === 0) return;

    setBusy(true);
    try {
      const fd = new FormData();
      for (const { file } of accepted) fd.append("files", file);

      // Route handler instead of server action — the server action multipart
      // parser surfaces "Unexpected end of form" on long uploads (#21). The
      // route handler streams via the standard Web FormData API and is
      // robust against the same conditions.
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: fd,
        // Same-origin only; NextAuth's cookie is SameSite=Lax so cross-site
        // POSTs can't carry the session anyway.
        credentials: "same-origin",
      });
      const result = (await res.json()) as UploadResponse;

      // Match server-returned uploaded[] back to upfront rows by the filename
      // the user picked (originalFilename), since the server may have renamed
      // the file (e.g., JPEG → WebP auto-conversion).
      setRecent((prev) =>
        prev.map((r) => {
          if (r.status !== "uploading") return r;
          const uploaded = result.uploaded.find((u) => u.originalFilename === r.filename);
          if (uploaded) return { ...r, status: "done", mediaId: uploaded.id };
          const err = result.errors.find((e) => e.filename === r.filename);
          if (err) return { ...r, status: "error", error: err.error };
          return r;
        })
      );

      if (result.uploaded.length) {
        toast.success(
          `Uploaded ${result.uploaded.length} file${result.uploaded.length === 1 ? "" : "s"}`
        );
        // Refresh server-component caches so the Library tab reflects the
        // new uploads when the user switches to it.
        router.refresh();
      }
      result.errors.forEach((e) => toast.error(`${e.filename}: ${e.error}`));
    } catch (err) {
      // Network errors (offline, dev-server restart) — the route handler
      // already surfaces "Upload interrupted…" on its side; this catches
      // the case where the request itself never completes.
      const raw = err instanceof Error ? err.message : String(err);
      const msg = `Upload failed: ${raw}`;
      setRecent((prev) =>
        prev.map((r) => (r.status === "uploading" ? { ...r, status: "error" as const, error: msg } : r))
      );
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(key: string, mediaId: string) {
    setDeleting((s) => new Set(s).add(key));
    try {
      const result = await deleteFile(mediaId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Deleted");
      setRecent((prev) =>
        prev.map((r) => (r.key === key ? { ...r, status: "deleted" as const } : r))
      );
    } finally {
      setDeleting((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`rounded-xl border-2 border-dashed p-10 transition-colors ${
          dragOver
            ? "border-brand-green bg-brand-light-green/30"
            : busy
              ? "border-slate-300 bg-white"
              : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-col items-center text-center">
          <UploadCloud className="size-10 text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-900">Drop images here to upload</p>
          <p className="text-xs text-slate-500 mt-1">or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 inline-flex items-center h-9 px-4 rounded-lg bg-brand-green text-white text-sm font-medium hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={settings.allowedMimeTypes.join(",")}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
            }}
          />
          <p className="text-xs text-slate-400 mt-4">
            {settings.allowedMimeTypes.join(", ")} · Max {settings.maxFileSizeMb} MB per file
          </p>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent</h3>
          <ul className="divide-y divide-slate-100">
            {recent.map((r) => {
              const isDeleting = deleting.has(r.key);
              return (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  {/* Thumbnail (or status-icon fallback for non-image errors) */}
                  {r.previewUrl ? (
                    <div className="relative size-10 shrink-0 rounded-md overflow-hidden border border-slate-200 bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.previewUrl}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-cover ${
                          r.status === "deleted" ? "opacity-30 grayscale" : ""
                        }`}
                      />
                      {r.status === "uploading" && (
                        <div className="absolute inset-0 bg-white/60 grid place-items-center">
                          <Loader2 className="size-4 text-slate-600 animate-spin" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="size-10 shrink-0 rounded-md border border-slate-200 bg-slate-50 grid place-items-center">
                      {r.status === "uploading" ? (
                        <Loader2 className="size-4 text-slate-400 animate-spin" />
                      ) : (
                        <XCircle className="size-4 text-rose-600" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${
                      r.status === "deleted" ? "text-slate-400 line-through" : "text-slate-900"
                    }`}>
                      {r.filename}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      {r.status === "done" && <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />}
                      {r.status === "error" && <XCircle className="size-3 text-rose-600 shrink-0" />}
                      <span className="truncate">
                        {formatBytes(r.sizeBytes)}
                        {r.status === "uploading" && " · uploading…"}
                        {r.status === "done" && " · uploaded"}
                        {r.status === "deleted" && " · deleted"}
                        {r.error ? ` · ${r.error}` : ""}
                      </span>
                    </div>
                  </div>

                  {r.status === "done" && r.mediaId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(r.key, r.mediaId!)}
                      disabled={isDeleting}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 shrink-0"
                      aria-label="Delete this upload"
                      title="Delete this upload"
                    >
                      {isDeleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
