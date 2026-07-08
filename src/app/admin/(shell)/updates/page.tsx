import type { Metadata } from "next";
import Link from "next/link";
import { Check, AlertTriangle, Package, Database, ShieldCheck, Sparkles, CloudOff, ArrowUpCircle } from "lucide-react";
import { db } from "@core/db/instance";
import { getUpdateStatus } from "@core/updates/check";
import { UpdateBanner } from "./UpdateBanner";
import { CheckedAtPill } from "./CheckedAtPill";
import { parseSqliteUtc } from "@core/datetime";
import packageJson from "../../../../../package.json";

export const metadata: Metadata = { title: "Updates" };

interface BackupRow {
  filename: string;
  size_bytes: number;
  created_at: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - parseSqliteUtc(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function UpdatesPage() {
  const [pluginRows, backupRow, recentFailureRow, updateStatus] = await Promise.all([
    db().execute({
      sql: "SELECT slug, enabled, failure_count FROM plugins",
      args: []
    }),
    db().execute({
      sql: "SELECT filename, size_bytes, created_at FROM backups ORDER BY created_at DESC LIMIT 1",
      args: []
    }),
    db().execute({
      sql: `SELECT COUNT(*) AS n FROM plugin_failures
            WHERE created_at > datetime('now', '-30 days')`,
      args: []
    }),
    getUpdateStatus(db())
  ]);

  const totalPlugins = pluginRows.rows.length;
  const enabledPlugins = pluginRows.rows.filter((r) => Number(r.enabled) === 1).length;
  const failingPlugins = pluginRows.rows.filter((r) => Number(r.failure_count) > 0).length;

  const lastBackup = backupRow.rows[0] as unknown as BackupRow | undefined;
  // Server Component renders once per request — Date.now() is effectively
  // a request-scoped constant here. The compiler's purity rule flags the
  // call generically; the practical purity holds.
  // eslint-disable-next-line react-hooks/purity
  const backupAge = lastBackup ? Date.now() - parseSqliteUtc(lastBackup.created_at).getTime() : null;
  const backupStale = backupAge !== null && backupAge > 7 * 24 * 60 * 60 * 1000;

  const recentFailures = Number(recentFailureRow.rows[0]?.n ?? 0);

  // Aggregate health for the hero. Issues = anything actionable: failing
  // plugins, recent boot/hook errors, OR an available engine upgrade.
  // Backup staleness stays a soft warning on the backup card itself.
  const issues: string[] = [];
  if (updateStatus && !updateStatus.isLatest && updateStatus.latest) {
    issues.push(`Newer NextPress version available: ${updateStatus.latest}`);
  }
  if (failingPlugins > 0) issues.push(`${failingPlugins} plugin${failingPlugins === 1 ? "" : "s"} reporting errors`);
  if (recentFailures > 0) issues.push(`${recentFailures} recent boot/hook error${recentFailures === 1 ? "" : "s"}`);
  const allClear = issues.length === 0;
  const updateAvailable = updateStatus && !updateStatus.isLatest && updateStatus.latest;
  const checkErrored = updateStatus?.error;

  // Display the pinned engine version if the project declared one
  // (downstream consumers). Falls back to the project's own version
  // when not set (the engine repo itself, where `version` IS the
  // engine version).
  const pkg = packageJson as { version: string; engineVersion?: string };
  const version = pkg.engineVersion ?? pkg.version;
  // Surface a friendly phase label parsed from the version suffix
  // (e.g. "0.1.0-phase-1" → "Phase 1 — kernel"). Falls back to plain version.
  const phaseLabel = (() => {
    const m = version.match(/phase-(\d+)/);
    if (!m) return null;
    const phaseNames: Record<string, string> = {
      "1": "Kernel + plugins + auth",
      "2": "Logging",
      "3": "Security",
      "4": "API",
      "5": "Settings + redirects",
      "6": "SEO essentials",
      "7": "Admin polish"
    };
    return `Phase ${m[1]}${phaseNames[m[1]] ? ` — ${phaseNames[m[1]]}` : ""}`;
  })();

  return (
    <>
      <h1 className="font-display text-4xl tracking-tight text-brand-navy">Updates</h1>
      <p className="mt-1 text-sm text-slate-500">
        At-a-glance status of your site.
      </p>

      {/* ── Hero status banner ────────────────────────────────────────── */}
      {allClear && !checkErrored ? (
        <div className="mt-8 rounded-2xl bg-brand-light-green border border-brand-green/30 p-6 flex items-start gap-4">
          <div className="size-12 rounded-full bg-brand-green text-white flex items-center justify-center shrink-0">
            <Check className="size-6" strokeWidth={3} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold text-brand-navy">
              Your site is up to date
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {updateStatus?.latest
                ? `Running the latest release (${updateStatus.latest}). All plugins healthy.`
                : "All plugins healthy and the engine is running smoothly."}
            </p>
          </div>
        </div>
      ) : allClear && checkErrored ? (
        <div className="mt-8 rounded-2xl bg-slate-50 border border-slate-200 p-6 flex items-start gap-4">
          <div className="size-12 rounded-full bg-slate-300 text-white flex items-center justify-center shrink-0">
            <CloudOff className="size-6" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold text-slate-700">
              Couldn&apos;t check for updates
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {updateStatus?.error}. Plugins are healthy locally — we&apos;ll retry on next page load.
            </p>
            {(() => {
              const err = updateStatus?.error?.toLowerCase() ?? "";
              if (err.includes("invalid github_token") || err.includes("refresh or remove")) {
                return (
                  <p className="mt-2 text-sm text-slate-500">
                    Issue a fresh{" "}
                    <a
                      href="https://github.com/settings/personal-access-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-slate-700"
                    >
                      fine-grained PAT
                    </a>{" "}
                    with <em>Contents: read</em> on the repo, update{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-slate-200 text-slate-700">GITHUB_TOKEN</code>{" "}
                    in <code className="text-xs px-1 py-0.5 rounded bg-slate-200 text-slate-700">.env.local</code>, and restart dev.
                  </p>
                );
              }
              if (err.includes("private") || err.includes("set github_token")) {
                return (
                  <p className="mt-2 text-sm text-slate-500">
                    If your repo is private, drop a{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-slate-200 text-slate-700">GITHUB_TOKEN</code>{" "}
                    with read access into <code className="text-xs px-1 py-0.5 rounded bg-slate-200 text-slate-700">.env.local</code>{" "}
                    and restart dev.
                  </p>
                );
              }
              return null;
            })()}
          </div>
        </div>
      ) : (
        <UpdateBanner
          issues={issues}
          updateAvailable={Boolean(updateAvailable)}
          latestVersion={updateStatus?.latest ?? null}
          releaseUrl={updateStatus?.releaseUrl ?? null}
        />
      )}

      {/* ── 2x2 detail card grid ─────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Engine version card */}
        <div className="rounded-xl bg-white border border-slate-200 p-6 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-10 -bottom-10 text-brand-light-green pointer-events-none"
          >
            <Sparkles className="size-32" strokeWidth={1} />
          </div>
          <div className="relative">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
              NextPress version
            </div>
            <div className="text-2xl font-semibold text-brand-navy">
              {version.split("-")[0]}
            </div>
            {phaseLabel && (
              <div className="mt-1.5 text-sm text-slate-500">{phaseLabel}</div>
            )}
            {updateAvailable ? (
              <a
                href={updateStatus.releaseUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider hover:bg-amber-100 transition-colors"
              >
                <ArrowUpCircle className="size-3" strokeWidth={3} />
                {updateStatus.latest} available
              </a>
            ) : checkErrored ? (
              <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <CloudOff className="size-3" strokeWidth={3} /> Couldn&apos;t check
              </div>
            ) : (
              <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light-green text-brand-green text-xs font-bold uppercase tracking-wider">
                <Check className="size-3" strokeWidth={3} /> Current
              </div>
            )}
            <CheckedAtPill checkedAt={updateStatus?.checkedAt ?? null} />
          </div>
        </div>

        {/* Plugins card */}
        <div className="rounded-xl bg-white border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
                Plugins
              </div>
              <div className="text-2xl font-semibold text-brand-navy">
                {enabledPlugins}
                <span className="text-slate-400 text-lg font-normal"> / {totalPlugins}</span>
              </div>
              <div className="mt-1.5 text-sm text-slate-500">enabled</div>
            </div>
            <div className="size-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center">
              <Package className="size-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            {failingPlugins === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light-green text-brand-green text-xs font-bold uppercase tracking-wider">
                <Check className="size-3" strokeWidth={3} /> All healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="size-3" strokeWidth={3} />
                {failingPlugins} need attention
              </span>
            )}
            <Link href="/admin/plugins" className="text-sm text-brand-green font-semibold hover:underline">
              Manage →
            </Link>
          </div>
        </div>

        {/* Backup card */}
        <div className="rounded-xl bg-white border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
                Last backup
              </div>
              {lastBackup ? (
                <>
                  <div className="text-2xl font-semibold text-brand-navy">
                    {timeAgo(lastBackup.created_at)}
                  </div>
                  <div className="mt-1.5 text-sm text-slate-500">
                    {formatBytes(lastBackup.size_bytes)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-slate-400">
                    No backups yet
                  </div>
                  <div className="mt-1.5 text-sm text-slate-500">
                    Take one before you need one.
                  </div>
                </>
              )}
            </div>
            <div className="size-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center">
              <Database className="size-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            {!lastBackup ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="size-3" strokeWidth={3} /> Recommended
              </span>
            ) : backupStale ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="size-3" strokeWidth={3} /> Getting stale
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light-green text-brand-green text-xs font-bold uppercase tracking-wider">
                <Check className="size-3" strokeWidth={3} /> Recent
              </span>
            )}
            <Link href="/admin/backup" className="text-sm text-brand-green font-semibold hover:underline">
              {lastBackup ? "Manage →" : "Create backup →"}
            </Link>
          </div>
        </div>

        {/* Health card */}
        <div className="rounded-xl bg-white border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">
                Health
              </div>
              {recentFailures === 0 ? (
                <>
                  <div className="text-2xl font-semibold text-brand-navy">
                    All clear
                  </div>
                  <div className="mt-1.5 text-sm text-slate-500">
                    No errors in the last 30 days.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-brand-navy">
                    {recentFailures}
                  </div>
                  <div className="mt-1.5 text-sm text-slate-500">
                    error{recentFailures === 1 ? "" : "s"} in the last 30 days
                  </div>
                </>
              )}
            </div>
            <div className="size-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center">
              <ShieldCheck className="size-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            {recentFailures === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light-green text-brand-green text-xs font-bold uppercase tracking-wider">
                <Check className="size-3" strokeWidth={3} /> Stable
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="size-3" strokeWidth={3} /> Investigate
              </span>
            )}
            <Link href="/admin/logs" className="text-sm text-brand-green font-semibold hover:underline">
              View logs →
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}
