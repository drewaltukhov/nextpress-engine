"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getMediaMigrationStats,
  runMigrationBatch,
  type MigrationDirection,
} from "./actions";
import type {
  MigrationStats,
  MigrationItemResult,
} from "@core-plugins/media/migrate";

interface Props {
  r2Available: boolean;
  initialStats: MigrationStats;
}

const BATCH_SIZE = 5;
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileNoun(count: number): string {
  return count === 1 ? "file" : "files";
}

interface ProgressState {
  direction: MigrationDirection;
  initialCount: number;
  initialBytes: number;
  processedCount: number;
  processedBytes: number;
  currentFilename: string | null;
  failed: MigrationItemResult[];
  stopRequested: boolean;
}

export function MigrationCard({ r2Available, initialStats }: Props) {
  const [stats, setStats] = useState<MigrationStats>(initialStats);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const stopRef = useRef(false);

  // Refresh stats once on mount in case they're stale from server render.
  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const res = await getMediaMigrationStats();
    if ("error" in res) return;
    setStats(res);
  }

  async function start(direction: MigrationDirection) {
    const source = direction === "db_to_r2" ? stats.db : stats.r2;
    if (source.count === 0) return;

    stopRef.current = false;
    setProgress({
      direction,
      initialCount: source.count,
      initialBytes: source.totalBytes,
      processedCount: 0,
      processedBytes: 0,
      currentFilename: null,
      failed: [],
      stopRequested: false,
    });

    let processedCount = 0;
    let processedBytes = 0;
    const failed: MigrationItemResult[] = [];

    // Tight loop: run a batch, update progress, repeat until done or stopped.
    while (!stopRef.current) {
      const result = await runMigrationBatch(direction, BATCH_SIZE);
      if ("error" in result) {
        toast.error(result.error);
        break;
      }
      for (const item of result.items) {
        if (item.ok) {
          processedCount++;
          processedBytes += item.bytesProcessed;
        } else {
          failed.push(item);
        }
      }
      const lastFilename = result.items[result.items.length - 1]?.filename ?? null;
      setProgress((p) =>
        p
          ? {
              ...p,
              processedCount,
              processedBytes,
              currentFilename: lastFilename,
              failed: [...failed],
            }
          : null
      );

      // Drained — exit cleanly.
      if (result.remaining.count === 0 || result.items.length === 0) break;
    }

    await refresh();
    setProgress((p) => (p ? { ...p, currentFilename: null } : null));

    if (failed.length === 0 && processedCount > 0) {
      toast.success(`Moved ${processedCount} ${fileNoun(processedCount)}.`);
    } else if (failed.length > 0) {
      toast.warning(`Moved ${processedCount} ${fileNoun(processedCount)}; ${failed.length} failed.`);
    }
  }

  function stop() {
    stopRef.current = true;
    setProgress((p) => (p ? { ...p, stopRequested: true } : null));
  }

  function dismiss() {
    setProgress(null);
  }

  const running = progress !== null && !progress.stopRequested && progress.processedCount < progress.initialCount;
  const finished = progress !== null && !running;

  return (
    <div className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Storage migration</h3>
      <p className="text-xs text-slate-500 mb-4">
        Move existing media between the database and Cloudflare R2. New uploads always use the active
        backend above; this only affects files already in your library.
      </p>

      {!progress && (
        <div className="space-y-3">
          <MigrationRow
            direction="db_to_r2"
            label="Move from database to R2"
            help={
              r2Available
                ? "Uploads the bytes to R2 and frees the database row."
                : "Configure R2 credentials above to enable."
            }
            count={stats.db.count}
            bytes={stats.db.totalBytes}
            disabled={!r2Available || stats.db.count === 0}
            onClick={() => start("db_to_r2")}
            verb="Move to R2"
            Icon={ArrowRight}
          />
          <MigrationRow
            direction="r2_to_db"
            label="Move from R2 back to database"
            help={
              r2Available
                ? "Downloads the bytes back into the database and deletes the R2 objects."
                : "Configure R2 credentials above to read existing R2 objects."
            }
            count={stats.r2.count}
            bytes={stats.r2.totalBytes}
            disabled={!r2Available || stats.r2.count === 0}
            onClick={() => start("r2_to_db")}
            verb="Move to database"
            Icon={ArrowLeft}
          />
        </div>
      )}

      {progress && <ProgressView progress={progress} running={running} finished={finished} onStop={stop} onDismiss={dismiss} />}
    </div>
  );
}

function MigrationRow({
  label,
  help,
  count,
  bytes,
  disabled,
  onClick,
  verb,
  Icon,
}: {
  direction: MigrationDirection;
  label: string;
  help: string;
  count: number;
  bytes: number;
  disabled: boolean;
  onClick: () => void;
  verb: string;
  Icon: typeof ArrowRight;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        count > 0 && !disabled ? "border-slate-200" : "border-slate-100 opacity-60"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {count > 0 ? (
            <>
              <span className="font-medium text-slate-700">{count} {fileNoun(count)}</span>
              {" · "}
              <span>{humanBytes(bytes)}</span>
              {" — "}
              {help}
            </>
          ) : (
            <>Nothing to move. {help}</>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon className="size-3.5" />
        {verb}
      </button>
    </div>
  );
}

function ProgressView({
  progress,
  running,
  finished,
  onStop,
  onDismiss,
}: {
  progress: ProgressState;
  running: boolean;
  finished: boolean;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const pct = progress.initialCount > 0 ? Math.min(100, (progress.processedCount / progress.initialCount) * 100) : 0;
  const bytesPct =
    progress.initialBytes > 0 ? Math.min(100, (progress.processedBytes / progress.initialBytes) * 100) : pct;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-900 font-medium">
          {running ? <Loader2 className="size-4 animate-spin text-brand-green" /> : finished && progress.failed.length === 0 ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertCircle className="size-4 text-amber-600" />}
          {running
            ? progress.direction === "db_to_r2"
              ? "Moving to R2…"
              : "Moving to database…"
            : finished
              ? "Done"
              : "Stopped"}
        </div>
        <div className="text-xs text-slate-500">
          {progress.processedCount} / {progress.initialCount} {fileNoun(progress.initialCount)}
          {" · "}
          {humanBytes(progress.processedBytes)} / {humanBytes(progress.initialBytes)}
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-brand-green transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(pct, bytesPct)}%` }}
        />
      </div>

      {progress.currentFilename && running && (
        <div className="text-xs text-slate-500 truncate">
          Just moved: <span className="font-mono text-slate-700">{progress.currentFilename}</span>
        </div>
      )}

      {progress.failed.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900 mb-1.5">
            {progress.failed.length} {fileNoun(progress.failed.length)} couldn&apos;t be moved
          </div>
          <ul className="text-xs text-amber-800 space-y-1 max-h-32 overflow-y-auto">
            {progress.failed.map((f) => (
              <li key={f.id} className="truncate">
                <span className="font-mono">{f.filename}</span>
                <span className="text-amber-700"> — {f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {running && (
          <button
            type="button"
            onClick={onStop}
            className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Stop
          </button>
        )}
        {finished && (
          <button
            type="button"
            onClick={onDismiss}
            className="h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
