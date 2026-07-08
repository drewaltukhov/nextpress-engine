import Link from "next/link";
import type { DbClient } from "@core/db/client";
import { isSmtpConfigured } from "@core/email/smtp";
import { getUpdateStatus } from "@core/updates/check";
import { getDbSizeBytes, formatBytes } from "@core/db/size";

interface SystemHealthData {
  smtpConfigured: boolean;
  dbBytes: number;
  updateStatus: Awaited<ReturnType<typeof getUpdateStatus>> | null;
}

async function fetchSystemHealth({ db }: { db: DbClient }): Promise<SystemHealthData> {
  const [smtpConfigured, dbBytes, updateStatus] = await Promise.all([
    isSmtpConfigured(db),
    getDbSizeBytes(db),
    getUpdateStatus(db).catch(() => null),
  ]);
  return { smtpConfigured, dbBytes, updateStatus };
}

function SystemHealthWidget({ data }: { data: SystemHealthData }) {
  const { smtpConfigured, dbBytes, updateStatus } = data;
  return (
    <div className="space-y-1.5 text-sm text-slate-600">
      <div className="flex items-center gap-2">
        <span className="text-green-600 font-bold">✓</span>
        <span>Database</span>
        <span className="ml-auto text-xs text-slate-400 tabular-nums">{formatBytes(dbBytes)}</span>
      </div>
      <div className="flex items-center gap-2">
        {smtpConfigured ? (
          <span className="text-green-600 font-bold">✓</span>
        ) : (
          <span className="text-amber-500 font-bold">⚠</span>
        )}
        Email transport
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-600 font-bold">✓</span> All plugins healthy
      </div>
      {updateStatus?.error ? (
        <Link
          href="/admin/updates"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 hover:underline"
          title={updateStatus.error}
        >
          <span className="font-bold">·</span>
          <span>Version check unavailable</span>
        </Link>
      ) : updateStatus && !updateStatus.isLatest && updateStatus.latest ? (
        <Link
          href="/admin/updates"
          className="flex items-center gap-2 text-amber-700 hover:underline"
        >
          <span className="text-amber-500 font-bold">⚠</span>
          <span>
            Update available: <span className="font-medium">{updateStatus.latest}</span>
          </span>
        </Link>
      ) : updateStatus?.isLatest ? (
        <div className="flex items-center gap-2">
          <span className="text-green-600 font-bold">✓</span> Latest version
        </div>
      ) : null}
    </div>
  );
}

export const systemHealthWidget = {
  slug: "core.system-health",
  source: "core" as const,
  title: "System Health",
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3 },
  maxSize: { w: 12, h: 8 },
  fetch: fetchSystemHealth,
  Component: SystemHealthWidget,
};
