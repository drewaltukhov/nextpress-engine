"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Download, Loader2 } from "lucide-react";

interface Props {
  count: number;
  totalBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function CreateMediaBackupCard({ count, totalBytes }: Props) {
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState("");

  async function handleCreate() {
    if (count === 0) {
      toast.error("No media uploaded yet — nothing to back up.");
      return;
    }
    setCreating(true);
    setStage("Building archive...");
    try {
      const res = await fetch("/api/admin/backup/media/download");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Media backup failed");
      }
      setStage("Downloading...");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] ?? "nextpress-media.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Media archive downloaded successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Media backup failed");
    } finally {
      setCreating(false);
      setStage("");
    }
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <ImageIcon className="size-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-slate-900">Backup Media</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Download every media file stored in the database as a ZIP archive — useful before
            wiping the DB or migrating off the db storage backend.
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 flex items-center gap-3">
        <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
        <span className="text-slate-500">file{count === 1 ? "" : "s"}</span>
        <span className="text-slate-300">·</span>
        <span className="tabular-nums">{formatBytes(totalBytes)}</span>
        <span className="text-slate-500">total</span>
      </div>

      <p className="text-xs text-slate-500 mb-5">
        Includes a <code className="font-mono">manifest.json</code> mapping each file to its
        original media id, mime type, and upload date. Files outside the db storage backend
        (future plugin-hosted media) are skipped.
      </p>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating || count === 0}
        className="h-10 px-6 rounded-lg bg-amber-600 text-white font-medium text-sm shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {stage}
          </>
        ) : (
          <>
            <Download className="size-4" />
            Download Media Archive
          </>
        )}
      </button>
    </div>
  );
}
