"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Check, Loader2 } from "lucide-react";

const checks = [
  "Posts, pages, and drafts",
  "Users and roles",
  "Settings and redirects",
  "Menus, topics, forms, and form submissions",
  "Plugins and theme configuration",
  "Every other table — present and future",
];

export function CreateBackupCard() {
  const router = useRouter();
  const [includeLogs, setIncludeLogs] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState("");

  async function handleCreate() {
    setCreating(true);
    setStage("Exporting database...");

    try {
      const params = new URLSearchParams();
      if (includeLogs) params.set("includeLogs", "1");

      setStage("Building backup...");
      const res = await fetch(`/api/admin/backup/download?${params}`);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Backup failed");
      }

      setStage("Downloading...");

      // Trigger browser download
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] ?? "nextpress-backup.npbackup";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Backup downloaded successfully");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setCreating(false);
      setStage("");
    }
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-brand-light-green/50 flex items-center justify-center shrink-0">
          <Download className="size-5 text-brand-green" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-slate-900">Create Backup</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Download a copy of every table except media — content, settings, users, configuration.
            Use the Backup Media card alongside this for the actual files.
          </p>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-sm font-medium text-slate-700 mb-2">What&apos;s included:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {checks.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
              <Check className="size-4 text-brand-green shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 mb-5 cursor-pointer">
        <input
          type="checkbox"
          checked={includeLogs}
          onChange={(e) => setIncludeLogs(e.target.checked)}
          className="rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
        />
        Include activity logs (system logs, failed logins — adds to file size)
      </label>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {stage}
          </>
        ) : (
          <>
            <Download className="size-4" />
            Create Backup
          </>
        )}
      </button>
    </div>
  );
}
