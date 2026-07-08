"use client";

import { CreateBackupCard } from "./CreateBackupCard";
import { CreateMediaBackupCard } from "./CreateMediaBackupCard";
import { RestoreCard } from "./RestoreCard";

interface Props {
  mediaStats: { count: number; totalBytes: number };
}

export function BackupPageClient({ mediaStats }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl tracking-tight text-brand-navy">
          Backup & Restore
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Download a complete copy of your site or restore from a previous backup.
        </p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CreateBackupCard />
          <CreateMediaBackupCard count={mediaStats.count} totalBytes={mediaStats.totalBytes} />
        </div>
        <RestoreCard />
      </div>
    </div>
  );
}
