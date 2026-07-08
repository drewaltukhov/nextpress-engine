"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, Plus, X, ExternalLink } from "lucide-react";
import { SCHEMA_CATALOG } from "@core-plugins/seo/schema-catalog";
import { saveEnabledSchemas } from "./actions";

interface Props {
  initial: string[];
}

const cardCls =
  "rounded-xl border border-slate-200 bg-white p-4 flex gap-3 items-start";

export function InstallSchemasTab({ initial }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(initial));
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? SCHEMA_CATALOG.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.type.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q),
          )
        : SCHEMA_CATALOG,
    [q],
  );

  const enabledList = filtered.filter((s) => enabled.has(s.type));
  const availableList = filtered.filter((s) => !enabled.has(s.type));

  function persist(next: Set<string>, prev: Set<string>) {
    startTransition(async () => {
      const result = await saveEnabledSchemas(Array.from(next));
      if (!result.ok) {
        setEnabled(prev);
        toast.error(result.error);
        return;
      }
    });
  }

  function add(type: string) {
    if (enabled.has(type)) return;
    const prev = enabled;
    const next = new Set(prev);
    next.add(type);
    setEnabled(next);
    persist(next, prev);
  }

  function remove(type: string) {
    if (!enabled.has(type)) return;
    const prev = enabled;
    const next = new Set(prev);
    next.delete(type);
    setEnabled(next);
    persist(next, prev);
  }

  return (
    <div className="space-y-6">
      {/* Search — matches the left-column width on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search schemas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
          />
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enabled */}
        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Enabled
              <span className="ml-2 text-xs font-normal text-slate-500">
                {enabled.size} {enabled.size === 1 ? "type" : "types"}
              </span>
            </h3>
          </header>

          {enabledList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
              {enabled.size === 0
                ? "No schemas enabled. Pick from the catalog →"
                : "No matches in enabled schemas."}
            </div>
          ) : (
            <div className="space-y-2">
              {enabledList.map((s) => (
                <SchemaCard
                  key={s.type}
                  entry={s}
                  action={
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(s.type)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                      aria-label={`Remove ${s.name}`}
                    >
                      <X className="size-3" />
                      Remove
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Available */}
        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Available
              <span className="ml-2 text-xs font-normal text-slate-500">
                {SCHEMA_CATALOG.length - enabled.size} {SCHEMA_CATALOG.length - enabled.size === 1 ? "type" : "types"}
              </span>
            </h3>
          </header>

          {availableList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
              {q
                ? "No matches. Try a different keyword."
                : "Every catalog schema is already enabled."}
            </div>
          ) : (
            <div className="space-y-2">
              {availableList.map((s) => (
                <SchemaCard
                  key={s.type}
                  entry={s}
                  action={
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => add(s.type)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-green px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-brand-green/90 transition disabled:opacity-50"
                      aria-label={`Add ${s.name}`}
                    >
                      <Plus className="size-3" />
                      Add
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SchemaCard({
  entry,
  action,
}: {
  entry: (typeof SCHEMA_CATALOG)[number];
  action: React.ReactNode;
}) {
  const Icon = entry.icon;
  return (
    <div className={cardCls}>
      <div className="shrink-0 rounded-lg bg-brand-light-green/40 p-2 text-brand-navy">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="truncate text-sm font-medium text-slate-900">{entry.name}</div>
          <a
            href={entry.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-slate-700 transition-colors"
            aria-label={`schema.org docs for ${entry.name}`}
          >
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{entry.description}</div>
      </div>
      <div className="shrink-0 self-center">{action}</div>
    </div>
  );
}
