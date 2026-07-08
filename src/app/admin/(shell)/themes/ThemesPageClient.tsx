"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Palette, Power, Settings, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@core/components/ConfirmDialog";
import type { ThemeListItem } from "@core-plugins/themes";
import { activateThemeAction } from "./actions";

interface Props {
  initial: ThemeListItem[];
}

export function ThemesPageClient({ initial }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const active = initial.find((t) => t.active) ?? null;

  function activate(theme: ThemeListItem) {
    void (async () => {
      const ok = await confirm({
        title: `Activate "${theme.name}"?`,
        description: active
          ? `This deactivates "${active.name}" and switches the public site to "${theme.name}". The change takes effect on the next request.`
          : `This switches the public site away from the default fallback shell to use the "${theme.name}" theme.`,
        confirmLabel: "Activate",
      });
      if (!ok) return;
      setPendingSlug(theme.slug);
      startTransition(async () => {
        const r = await activateThemeAction(theme.slug);
        setPendingSlug(null);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(`Activated ${theme.name}`);
        router.refresh();
      });
    })();
  }

  function deactivate() {
    void (async () => {
      const ok = await confirm({
        title: "Deactivate the active theme?",
        description: "The public site will fall back to the default hardcoded shell until another theme is activated.",
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
      setPendingSlug(active?.slug ?? "");
      startTransition(async () => {
        const r = await activateThemeAction(null);
        setPendingSlug(null);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Theme deactivated");
        router.refresh();
      });
    })();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Themes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Themes control how your public site looks. Pick any theme below &mdash; the change goes live instantly.
          </p>
        </div>
        {active ? (
          <button
            type="button"
            onClick={deactivate}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Power className="size-4" />
            Deactivate
          </button>
        ) : null}
      </div>

      {initial.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((theme) => (
            <ThemeCard
              key={theme.slug}
              theme={theme}
              busy={pending && pendingSlug === theme.slug}
              onActivate={() => activate(theme)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Palette className="mx-auto mb-3 size-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-900">No themes installed</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Themes live in the <code>themes/</code> folder of the repo. Add one (with a <code>plugin.json</code> manifest where <code>type</code> is <code>theme</code>) and re-run <code>npm run plugins:discover</code>.
      </p>
    </div>
  );
}

function ThemeCard({
  theme,
  busy,
  onActivate,
}: {
  theme: ThemeListItem;
  busy: boolean;
  onActivate: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white transition ${
        theme.active
          ? "border-brand-green ring-2 ring-brand-green/30"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="relative flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-brand-light-green/40 to-slate-50 overflow-hidden">
        {!coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <Palette className="size-12 text-brand-green/60" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-brand-navy">{theme.name}</h3>
            <p className="text-xs text-slate-500">
              v{theme.version}
              {theme.author ? <> &middot; {theme.author}</> : null}
            </p>
          </div>
          {theme.active ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-green/10 px-2 py-0.5 text-[11px] font-medium text-brand-green">
              <Check className="size-3" />
              Active
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {theme.active ? (
            <span className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-500">
              Active
            </span>
          ) : (
            <button
              type="button"
              onClick={onActivate}
              disabled={busy}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-green px-3 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50"
            >
              <Power className="size-4" />
              {busy ? "Activating…" : "Activate"}
            </button>
          )}
          <Link
            href={`/admin/themes/${theme.slug}/settings`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Open theme settings"
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <Link
            href={`/admin/themes/${theme.slug}/builder`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Open theme builder"
          >
            <Wrench className="size-4" />
            Builder
          </Link>
        </div>
      </div>
    </div>
  );
}
