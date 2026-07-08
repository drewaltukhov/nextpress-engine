"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ExternalLink,
  FileText,
  Hash,
  Layers,
  Newspaper,
  Search,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchContentForLink,
  type ContentLinkOption,
} from "@core/links/picker-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL to seed the input with when opening. Empty string means "new link". */
  initialUrl: string;
  /** Whether the existing link opens in a new tab — drives the checkbox. */
  initialOpenInNewTab: boolean;
  /** Whether the current selection already has a link mark — drives the
   *  visibility of the Remove button. */
  hasLink: boolean;
  /** Called with the final URL and target choice on Apply. */
  onApply: (url: string, openInNewTab: boolean) => void;
  /** Called when the user clicks Remove. */
  onRemove: () => void;
}

export function LinkDialog({
  open,
  onOpenChange,
  initialUrl,
  initialOpenInNewTab,
  hasLink,
  onApply,
  onRemove,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{hasLink ? "Edit link" : "Add link"}</DialogTitle>
          <DialogDescription>
            Paste a URL or pick from your published pages, posts, and topics.
          </DialogDescription>
        </DialogHeader>
        {/* Mount form fresh on every open. The key bakes in the seed so
            reopening with a different selection's link href starts from
            that href, and closing without saving doesn't keep stale
            input from a previous session. */}
        {open ? (
          <LinkDialogForm
            key={`${initialUrl}::${hasLink}::${initialOpenInNewTab}`}
            initialUrl={initialUrl}
            initialOpenInNewTab={initialOpenInNewTab}
            hasLink={hasLink}
            onApply={(u, newTab) => {
              onApply(u, newTab);
              onOpenChange(false);
            }}
            onRemove={() => {
              onRemove();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface FormProps {
  initialUrl: string;
  initialOpenInNewTab: boolean;
  hasLink: boolean;
  onApply: (url: string, openInNewTab: boolean) => void;
  onRemove: () => void;
  onCancel: () => void;
}

function LinkDialogForm({
  initialUrl,
  initialOpenInNewTab,
  hasLink,
  onApply,
  onRemove,
  onCancel,
}: FormProps) {
  const [url, setUrl] = useState(initialUrl);
  const [openInNewTab, setOpenInNewTab] = useState(initialOpenInNewTab);
  const [contentQuery, setContentQuery] = useState("");
  const [options, setOptions] = useState<ContentLinkOption[]>([]);
  const [pending, startTransition] = useTransition();

  // Debounce the content search so we don't fire one server action per
  // keystroke. 200ms is short enough to feel snappy and long enough to
  // skip intermediate values for typical typing speed. The setState
  // happens inside startTransition, which keeps the set-state-in-effect
  // lint rule satisfied (the rule allows callbacks invoked from effects).
  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(async () => {
        const next = await searchContentForLink(contentQuery);
        setOptions(next);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [contentQuery]);

  function handleApply(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onApply(trimmed, openInNewTab);
  }

  function pickOption(option: ContentLinkOption) {
    setUrl(option.url);
  }

  return (
    <form onSubmit={handleApply} className="space-y-4">
      <div>
        <label htmlFor="link-url" className="mb-1.5 block text-xs font-medium text-slate-700">
          URL
        </label>
        <div className="relative">
          <ExternalLink className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="link-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com or /about"
            autoFocus
            className={`${inputCls} pl-8`}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Internal paths start with <code>/</code>. External URLs accept any scheme.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={openInNewTab}
          onChange={(e) => setOpenInNewTab(e.target.checked)}
          className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
        />
        Open in new tab
        {openInNewTab && (
          <span className="text-[11px] text-slate-500">
            (rel=&quot;noopener noreferrer&quot; applied automatically)
          </span>
        )}
      </label>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="block text-xs font-medium text-slate-700">
            Or pick a page, post, or topic
          </span>
          {pending && <span className="text-[11px] text-slate-400">Searching…</span>}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={contentQuery}
            onChange={(e) => setContentQuery(e.target.value)}
            placeholder="Search by title…"
            className={`${inputCls} pl-8`}
          />
        </div>

        <ul className="mt-2 max-h-[40vh] overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {options.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-slate-500">
              {contentQuery.trim() ? "No matches." : "No published content yet."}
            </li>
          ) : (
            options.map((opt) => {
              const selected = url.trim() === opt.url;
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    onClick={() => pickOption(opt)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                      selected ? "bg-brand-green/5" : ""
                    }`}
                  >
                    <OptionIcon option={opt} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-slate-900">{opt.title}</span>
                        <KindBadge option={opt} />
                      </div>
                      <div className="truncate text-xs text-slate-500">{opt.url}</div>
                    </div>
                    {selected && (
                      <span className="text-[11px] font-medium text-brand-green">Selected</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <DialogFooter className="!justify-between">
        {hasLink ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-rose-200 bg-white text-rose-700 font-medium text-sm transition-colors hover:bg-rose-50"
          >
            <Trash2 className="size-4" />
            Remove link
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!url.trim()}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </DialogFooter>
    </form>
  );
}

function OptionIcon({ option }: { option: ContentLinkOption }) {
  const cls = "size-4 shrink-0 text-slate-400";
  if (option.kind === "post") return <Newspaper className={cls} />;
  if (option.kind === "topic") return <Hash className={cls} />;
  return <FileText className={cls} />;
}

function KindBadge({ option }: { option: ContentLinkOption }) {
  if (option.kind === "page") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
        Page
      </span>
    );
  }
  if (option.kind === "topic") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
        Topic
      </span>
    );
  }
  // Post — disambiguate pillar / spike / standalone, and show parent pillar
  // for spikes since two spikes can share a title under different pillars.
  const label =
    option.postKind === "pillar"
      ? "Pillar"
      : option.postKind === "spike"
        ? "Spike"
        : "Post";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
        {label}
      </span>
      {option.postKind === "spike" && option.parentTitle ? (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
          <Layers className="size-3" />
          <span className="truncate max-w-[10rem]">{option.parentTitle}</span>
        </span>
      ) : null}
    </span>
  );
}
