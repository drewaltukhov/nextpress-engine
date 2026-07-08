"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, FileText, Hash, Newspaper, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchContentForLink,
  type ContentLinkOption,
} from "@core/links/picker-actions";

const inputCls =
  "flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface ContentLinkInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * URL field with a "Browse" button that opens a content picker listing
 * published pages and posts. Mirrors `MediaPickerInput` so anyone editing a
 * Hero (or other block linking to internal content) gets the same shape:
 * type freely, paste an external URL, or click Browse and pick a target.
 *
 * The picked URL is the public path (`/<slug>` or `/<pillar>/<spike>`),
 * which matches how the public renderer links to pages and posts. External
 * URLs flow through unchanged.
 */
export function ContentLinkInput({
  id,
  value,
  onChange,
  placeholder = "https://… or pick from your content",
  className,
}: ContentLinkInputProps) {
  const [open, setOpen] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
      >
        <Search className="size-4" />
        Browse
      </button>

      <div className="mt-2 flex items-stretch gap-2">
        <div className="relative flex-1">
          <ExternalLink className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${inputCls} pl-8`}
          />
        </div>
        {hasValue ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors"
            aria-label="Remove"
            title="Remove"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <ContentPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(item) => {
          onChange(item.url);
          setOpen(false);
        }}
      />
    </div>
  );
}

export interface ContentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: ContentLinkOption) => void;
}

/**
 * Reusable content-picker modal — shared between `ContentLinkInput`
 * (full input + Browse button) and compact per-row pickers like the
 * mega-menu editor's link rows. Mount via React state and pass an
 * `onPick` that writes the chosen URL to your field.
 */
export function ContentPickerDialog({ open, onOpenChange, onPick }: ContentPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pick a page or post</DialogTitle>
          <DialogDescription>
            Search your published content. Picking sets the URL field for you.
          </DialogDescription>
        </DialogHeader>
        {/* Mount fresh on every open so the search box and result list start
            empty without an effect-driven reset. Same pattern LinkDialog
            uses for its inner form. */}
        {open ? <ContentPickerBody onPick={onPick} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface ContentPickerBodyProps {
  onPick: (item: ContentLinkOption) => void;
}

function describeOption(item: ContentLinkOption): {
  Icon: typeof FileText;
  badgeLabel: string;
  badgeClass: string;
} {
  if (item.kind === "topic") {
    return {
      Icon: Hash,
      badgeLabel: "Topic",
      badgeClass: "bg-violet-100 text-violet-700",
    };
  }
  if (item.kind === "page") {
    return {
      Icon: FileText,
      badgeLabel: "Page",
      badgeClass: "bg-sky-100 text-sky-700",
    };
  }
  // Posts: differentiate pillar vs spike (and standalone) so the user
  // can spot the cluster shape from the row alone.
  if (item.postKind === "pillar") {
    return {
      Icon: Newspaper,
      badgeLabel: "Pillar",
      badgeClass: "bg-amber-100 text-amber-700",
    };
  }
  if (item.postKind === "spike") {
    return {
      Icon: Newspaper,
      badgeLabel: "Spike",
      badgeClass: "bg-emerald-100 text-emerald-700",
    };
  }
  return {
    Icon: Newspaper,
    badgeLabel: "Post",
    badgeClass: "bg-slate-100 text-slate-700",
  };
}

function ContentPickerBody({ onPick }: ContentPickerBodyProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContentLinkOption[]>([]);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  // Debounce searches at 200ms to keep typing snappy without flooding the
  // server action — same cadence as LinkDialog. Empty query on first run
  // returns the most recent published items so the list isn't blank before
  // the user types.
  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(async () => {
        const next = await searchContentForLink(query);
        setHits(next);
        setLoaded(true);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title…"
          autoFocus
          className={`w-full pl-8 ${inputCls}`}
        />
        {pending ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
            Searching…
          </span>
        ) : null}
      </div>

      <ul className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
        {!loaded ? (
          <li className="px-3 py-6 text-center text-xs text-slate-500">Loading…</li>
        ) : hits.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-slate-500">
            {query.trim() ? "No matches." : "No published content yet."}
          </li>
        ) : (
          hits.map((item) => {
            const { Icon, badgeLabel, badgeClass } = describeOption(item);
            const subtitle =
              item.kind === "post" && item.parentTitle
                ? `${item.parentTitle} · ${item.url}`
                : item.url;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                >
                  <Icon className="size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">
                        {item.title}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
                      >
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{subtitle}</div>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
